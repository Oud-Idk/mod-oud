use crate::events::handlers::message_filter::verdict::FilterVerdict;
use crate::types::config::config::GuildSettings;
use crate::types::config::message_filter::{RuleScope, ScopeMode};
use crate::types::{Data, Error};
use serenity::all::{Context, Message};

pub mod rules;
pub mod utils;
pub mod actions;
pub mod database;
pub mod verdict;
pub mod spam;

fn should_apply_filter(scope: &RuleScope, channel_id: u64, user_roles: &[u64]) -> bool {
    let is_channel_matched = scope.channels.contains(&channel_id);
    let is_role_matched = user_roles.iter().any(|role| scope.roles.contains(role));
    let is_matched = is_channel_matched || is_role_matched;

    match scope.mode {
        ScopeMode::Exempt => !is_matched,   // If matched, they are exempt (do not filter)
        ScopeMode::Enforced => is_matched,  // If matched, they are enforced (do filter)
    }
}

pub async fn handle_filtering(ctx: &Context, data: &Data, config: &GuildSettings, message: &Message) -> Result<bool, Error> {
    let Some(guild_id) = message.guild_id else {
        return Ok(false);
    };

    let guild_id_u64 = guild_id.get();
    let author_id = message.author.id.get();

    if let Some(filtering) = &config.message_filtering {
        if let Some(global_scope) = &filtering.global_settings {
            let member_roles: Vec<u64> = message
                .member
                .as_ref()
                .map(|member| member.roles.iter().map(|role_id| role_id.get()).collect())
                .unwrap_or_default();

            let channel_id_u64 = message.channel_id.get();
            let should_apply_filter = should_apply_filter(global_scope, channel_id_u64, &member_roles);

            if should_apply_filter {
                let was_spam = spam::handle_spam_prevention(
                    ctx,
                    message,
                    data,
                    filtering,
                    guild_id_u64,
                    author_id,
                ).await?;

                if was_spam {
                    return Ok(true);
                }

                // Run the purely synchronous evaluation pipeline
                let mut verdict = rules::filter_bad_words(message, filtering)
                    .or_else(|| rules::filter_offensive_messages(message, filtering))
                    .or_else(|| rules::filter_server_invites(message, filtering))
                    .or_else(|| rules::filter_external_urls(message, filtering))
                    .or_else(|| rules::filter_excessive_caps(message, filtering))
                    .or_else(|| rules::filter_excessive_emojis(message, filtering))
                    .or_else(|| rules::filter_excessive_spoilers(message, filtering))
                    .or_else(|| rules::filter_excessive_mentions(message, filtering))
                    .or_else(|| rules::filter_zalgo(message, filtering));

                // Resolve deferred async checks (like Safe Browsing) only if requested
                if let FilterVerdict::RequiresSafeBrowsingCheck { urls, external_links } = verdict {
                    verdict = verdict::resolve_safe_browsing(data, external_links, &urls).await;
                }

                // Execute the actions associated with the final verdict
                if !verdict.is_pass() {
                    verdict::execute_verdict(ctx, data, message, verdict).await?;
                    return Ok(true);
                }

                return Ok(false);
            }
        }
    }
    Ok(false)
}