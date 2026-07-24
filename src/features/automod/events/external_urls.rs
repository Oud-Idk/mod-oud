use super::super::rules::check_rule;
use crate::Data;
use crate::features::automod::patterns::LINK_FINDER;
use crate::features::automod::types::FilterVerdict;
use crate::features::automod::types::{ExternalLinksRule, MessageFilteringConfig, Modes, ThreatType};
use linkify::LinkKind;
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
    let (_, urls) = remove_urls(&message.content);
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

    debug!(url, rule_name, "Message flagged by External URLs domain list filters");
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
        if domain.is_char_boundary(split_idx) {
            let (prefix, suffix) = domain.split_at(split_idx);
            if suffix.eq_ignore_ascii_case(pattern) && prefix.ends_with('.') {
                return true;
            }
        }
    }

    false
}

pub fn extract_domain(url: &str) -> Option<&str> {
    let without_protocol = if let Some(idx) = url.find("://") {
        &url[idx + 3..]
    } else {
        url
    };

    let domain = match without_protocol.find('/') {
        Some(idx) => &without_protocol[..idx],
        None => without_protocol,
    };

    let domain_without_port = match domain.find(':') {
        Some(idx) => &domain[..idx],
        None => domain,
    };

    if domain_without_port.is_empty() {
        None
    } else {
        Some(domain_without_port)
    }
}

pub fn remove_urls(input: &str) -> (String, Vec<&str>) {
    let mut links_iter = LINK_FINDER.links(input).peekable();

    if links_iter.peek().is_none() {
        return (input.to_string(), Vec::new());
    }

    let mut cleaned = String::with_capacity(input.len());
    let mut urls = Vec::new();
    let mut last_pos = 0;

    for link in links_iter {
        if link.kind() == &LinkKind::Url {
            cleaned.push_str(&input[last_pos..link.start()]);
            urls.push(link.as_str());
            last_pos = link.end();
        }
    }
    cleaned.push_str(&input[last_pos..]);
    (cleaned, urls)
}

fn any_breaking_rule_domain<'a>(external_links: &ExternalLinksRule, urls: &[&'a str]) -> Option<&'a str> {
    for url in urls {
        let Some(domain) = extract_domain(url) else {
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
    data: &Data,
    external_links: &'a ExternalLinksRule,
    urls: &[String],
) -> FilterVerdict<'a> {
    let Some(client) = &data.safe_browsing_client else {
        trace!("Safe Browsing client is not configured; passing evaluation");
        return FilterVerdict::Pass;
    };

    let url_refs: Vec<&str> = urls.iter().map(|s| s.as_str()).collect();

    trace!(?url_refs, "Requesting threat analysis from Safe Browsing API");
    match client.check_urls(&url_refs).await {
        Ok(threats_int) if !threats_int.is_empty() => {
            let threats_str = threats_int
                .iter()
                .map(|threat_type| format!("{}", ThreatType::from(*threat_type)))
                .collect::<Vec<String>>()
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
                    "You have sent a malicious URL with these flags: {}",
                    threats_str
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