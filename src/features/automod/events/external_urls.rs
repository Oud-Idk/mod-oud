use super::super::rules::check_rule;
use crate::core::config::state::BotData;
use crate::features::automod::types::FilterVerdict;
use crate::features::automod::types::{
    ExternalLinksRule, MessageFilteringConfig, Modes, ThreatType,
};
use crate::shared::messages;
use serenity::all::Message;
use std::borrow::Cow;
use tracing::{debug, error, instrument, trace};

pub fn filter_external_urls<'a>(
    message: &'a Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(external_links) = check_rule(filtering.external_links.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'External URLs' filter rule");
    let (_, urls) = messages::remove_urls(&message.content);
    if urls.is_empty() {
        return FilterVerdict::Pass;
    }

    if external_links.block_only_malicious {
        trace!("External URLs verification deferred for external API evaluation");
        return FilterVerdict::RequiresSafeBrowsingCheck {
            urls: urls.into_iter().map(String::from).collect(),
            external_links,
        };
    }

    let Some(url) = any_breaking_rule_domain(external_links, &urls) else {
        return FilterVerdict::Pass;
    };

    // Restore dynamic rule name based on the mode configuration
    let rule_name = match external_links.mode {
        Modes::Allowlist => "External URLs (Not Allowed)",
        Modes::Denylist => "External URLs (Blocklisted)",
    };

    debug!(
        url,
        rule_name, "Message flagged by External URLs domain list filters"
    );
    FilterVerdict::Block {
        rule_name: rule_name.into(),
        base_rule: Cow::Owned(external_links.base.clone()),
        trigger_content: Some(Cow::Borrowed(url)),
        custom_dm_message: None,
    }
}

pub fn domain_is_set(domains: &[String], domain_to_check: &str) -> bool {
    domains
        .iter()
        .any(|allowed| is_domain_match(domain_to_check, allowed))
}

fn is_domain_match(domain: &str, pattern: &str) -> bool {
    if domain.eq_ignore_ascii_case(pattern) {
        return true;
    }

    if domain.len() > pattern.len() {
        let split_idx = domain.len() - pattern.len();

        // Ensure split is at the correct boundary
        if domain.is_char_boundary(split_idx) {
            let (prefix, suffix) = domain.split_at(split_idx);

            // Match if suffix equals pattern and prefix ends with a dot
            // For example, prefix = `sub.`, suffix = `example.com`.
            // Checking for '.' prevents spoofing with bad domains like `phishingexample.com`.
            if suffix.eq_ignore_ascii_case(pattern) && prefix.ends_with('.') {
                return true;
            }
        }
    }

    false
}

pub fn extract_domain(url: &str) -> Option<&str> {
    // Finds `://` and skips 3 characters ahead
    // https://example.com:8080/api/v1 -> example.com:8080/api/v1
    let without_protocol = url.find("://").map_or(url, |idx| &url[idx + 3..]);
    // Finds the first `/`, `?`, or `#` (URLs are weird) and take everything before
    // example.com:8080/api/v1 -> example.com:8080
    let domain_and_port = without_protocol
        .find(['/', '?', '#'])
        .map_or(without_protocol, |idx| &without_protocol[..idx]);
    // Find the the `:` which indicates port number, then take everything before
    // example.com:8080 -> example.com
    let domain = domain_and_port
        .find(':')
        .map_or(domain_and_port, |idx| &domain_and_port[..idx]);

    if domain.is_empty() {
        None
    } else {
        Some(domain)
    }
}

fn any_breaking_rule_domain<'a>(
    external_links: &ExternalLinksRule,
    urls: &[&'a str],
) -> Option<&'a str> {
    for url in urls {
        let Some(domain) = extract_domain(url) else {
            // If domain couldn't be extracted, assume breaking under allowlist, otherwise skip
            if matches!(external_links.mode, Modes::Allowlist) {
                return Some(url);
            }
            continue;
        };

        match external_links.mode {
            Modes::Allowlist => {
                let is_allowed = domain_is_set(&external_links.allowed_domains, domain);

                if !is_allowed {
                    return Some(url);
                }
            }
            Modes::Denylist => {
                let is_blocked = domain_is_set(&external_links.blocked_domains, domain);

                if is_blocked {
                    return Some(url);
                }
            }
        }
    }

    None
}

#[instrument(
    name = "resolve_safe_browsing",
    skip(data, external_links),
    fields(url_count = urls.len())
)]
pub async fn resolve_safe_browsing<'a>(
    data: &BotData,
    external_links: &'a ExternalLinksRule,
    urls: &[String],
) -> FilterVerdict<'a> {
    let Some(client) = &data.security.safe_browsing else {
        trace!("Safe Browsing client is not configured; passing evaluation");
        return FilterVerdict::Pass;
    };

    let url_refs: Vec<&str> = urls.iter().map(String::as_str).collect();

    trace!(
        ?url_refs,
        "Requesting threat analysis from Safe Browsing API"
    );
    match client.check_urls(&url_refs).await {
        Ok(threats_int) if !threats_int.is_empty() => {
            let threats_str = threats_int
                .iter()
                .map(|threat_type| format!("{}", ThreatType::from(*threat_type))) // From i32
                .collect::<Vec<String>>() // Collect as String as ThreatType implements Display
                .join(", ");

            debug!(
                threats = %threats_str,
                "Malicious URL threat confirmed by Safe Browsing API check"
            );

            FilterVerdict::Block {
                rule_name: Cow::Borrowed("Malicious URLs"),
                base_rule: Cow::Borrowed(&external_links.base),
                trigger_content: Some(Cow::Owned(threats_str.clone())),
                custom_dm_message: Some(Cow::Owned(format!(
                    "You have sent a malicious URL with these flags: {threats_str}"
                ))),
            }
        }
        Ok(_) => {
            trace!("URLs verified as clean by Safe Browsing API check");
            FilterVerdict::Pass
        }
        Err(e) => {
            error!(
                error = %e,
                "Safe Browsing API validation request failed; falling back to Pass"
            );
            FilterVerdict::Pass
        }
    }
}
