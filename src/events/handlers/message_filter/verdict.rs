use crate::events::handlers::message_filter::actions;
use crate::types::config::message_filter::{BaseRule, ExternalLinksRule};
use crate::types::flag::{FlagSeverity, ThreatType};
use crate::types::types::{Data, Error};
use crate::utils::logger::{log_offensive_message, log_scam_message};
use serenity::all::Message;
use std::borrow::Cow;

pub enum FilterVerdict<'a> {
    Pass,
    Block {
        rule_name: &'static str,
        base_rule: &'a BaseRule,
        trigger_content: Option<Cow<'a, str>>,
        custom_dm_message: Option<Cow<'a, str>>,
        metadata: ViolationMetadata,
    },
    RequiresSafeBrowsingCheck {
        urls: Vec<String>,
        external_links: &'a ExternalLinksRule,
    },
}

impl<'a> FilterVerdict<'a> {
    /// Evaluates the fallback closure only if the current verdict is `Pass`.
    pub fn or_else<F>(self, f: F) -> Self
    where
        F: FnOnce() -> Self,
    {
        match self {
            FilterVerdict::Pass => f(),
            other => other,
        }
    }

    /// Helper to check if the verdict is a pass
    pub fn is_pass(&self) -> bool {
        matches!(self, FilterVerdict::Pass)
    }
}

pub enum ViolationMetadata {
    None,
    Offensive {
        severity: FlagSeverity,
    },
    MaliciousUrls {
        threats: Vec<i32>,
    },
}

pub async fn resolve_safe_browsing<'a>(
    data: &Data,
    external_links: &'a ExternalLinksRule,
    urls: &[String],
) -> FilterVerdict<'a> {
    let Some(client) = &data.safe_browsing_client else {
        return FilterVerdict::Pass;
    };

    // Convert Vec<String> refs to Vec<&str> for check_urls
    let url_refs: Vec<&str> = urls.iter().map(|s| s.as_str()).collect();

    match client.check_urls(&url_refs).await {
        Ok(threats_int) if !threats_int.is_empty() => {
            let threats_str = threats_int
                .iter()
                .map(|threat_type| format!("{}", ThreatType::from(*threat_type)))
                .collect::<Vec<String>>()
                .join(", ");

            FilterVerdict::Block {
                rule_name: "Malicious URLs",
                base_rule: &external_links.base,
                trigger_content: Some(Cow::Owned(threats_str.clone())),
                custom_dm_message: Some(Cow::Owned(format!(
                    "You have sent a malicious URL with these flags: {}",
                    threats_str
                ))),
                metadata: ViolationMetadata::MaliciousUrls { threats: threats_int },
            }
        }
        Ok(_) => FilterVerdict::Pass,
        Err(e) => {
            eprintln!("Safe Browsing API check failed: {}", e);
            FilterVerdict::Pass
        }
    }
}

pub async fn execute_verdict(
    ctx: &serenity::all::Context,
    data: &Data,
    message: &Message,
    verdict: FilterVerdict<'_>,
) -> Result<bool, Error> {
    let FilterVerdict::Block {
        rule_name,
        base_rule,
        trigger_content,
        custom_dm_message,
        metadata,
    } = verdict else {
        return Ok(false); // No violation occurred, message can pass
    };

    let author_id = message.author.id.get();
    let channel_id = message.channel_id.get();
    let message_id = message.id.get();
    let guild_id = message.guild_id.unwrap_or_default().get();

    // 1. Handle any custom logging based on metadata variants
    match metadata {
        ViolationMetadata::Offensive { severity } => {
            log_offensive_message(
                data,
                guild_id,
                channel_id,
                message_id,
                author_id,
                &message.content,
                severity,
            )
                .await?;
        }
        ViolationMetadata::MaliciousUrls { threats } => {
            log_scam_message(
                data,
                guild_id,
                channel_id,
                message_id,
                author_id,
                &message.content,
                &threats,
            )
                .await?;
        }
        ViolationMetadata::None => {}
    }

    actions::execute_rule_actions(
        ctx,
        &data.db,
        message,
        base_rule,
        rule_name,
        trigger_content.as_deref(),
        custom_dm_message.as_deref(),
        None,
    )
        .await;

    Ok(true) // Violation occurred and was handled
}