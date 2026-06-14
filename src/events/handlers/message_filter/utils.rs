use crate::types::config::message_filter::{ExternalLinksRule, Modes};
use linkify::{LinkFinder, LinkKind};
use regex::Regex;
use rustrict::Type;
use std::sync::LazyLock;
use unicode_segmentation::UnicodeSegmentation;

static DISCORD_FORMAT_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<(?:a?:[a-zA-Z0-9_]+:|@&?|#)\d+>").unwrap());
pub static INVITE_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)(discord\.(gg|io|me|li|com/invite|app\.com/invite))/([a-zA-Z0-9\-]+)").unwrap());
pub static DISCORD_EMOJI_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<(a?):(\w+):(\d+)>").unwrap());
pub static DISCORD_PING_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<@[!&]?[0-9]{17,20}>|@(everyone|here)").unwrap());
static LINK_FINDER: LazyLock<LinkFinder> = LazyLock::new(LinkFinder::new);

pub fn count_emojis(text: &str) -> usize {
    text.graphemes(true)
        .filter(|grapheme| emojis::get(grapheme).is_some())
        .count()
}

fn is_combining_mark(c: char) -> bool {
    matches!(
        c,
        '\u{0300}'..='\u{036F}' |
        '\u{1AB0}'..='\u{1AFF}' |
        '\u{1DC0}'..='\u{1DFF}' |
        '\u{20D0}'..='\u{20FF}' |
        '\u{FE20}'..='\u{FE2F}'
    )
}

pub fn is_zalgo_grapheme(text: &str, max_marks_per_char: usize) -> bool {
    let mut combining_count = 0;
    for c in text.chars() {
        if is_combining_mark(c) {
            combining_count += 1;
            if combining_count > max_marks_per_char {
                return true;
            }
        } else {
            combining_count = 0;
        }
    }
    false
}

pub fn remove_urls(input: &str) -> (String, Vec<&str>) {
    // Pre-allocate the capacity to avoid incremental reallocations
    let mut cleaned = String::with_capacity(input.len());
    let mut urls = Vec::new();
    let mut last_pos = 0;

    for link in LINK_FINDER.links(input) {
        if link.kind() == &LinkKind::Url {
            cleaned.push_str(&input[last_pos..link.start()]);
            urls.push(link.as_str());
            last_pos = link.end();
        }
    }
    cleaned.push_str(&input[last_pos..]);
    (cleaned, urls)
}

/// Cleans raw text of URLs and specific Discord formatting elements.
pub fn clean_message_content(content: &str) -> String {
    let (cleaned_urls, _) = remove_urls(content);

    // Avoid allocating a duplicate string if no regex replacement was needed
    match DISCORD_FORMAT_REGEX.replace_all(&cleaned_urls, "") {
        std::borrow::Cow::Owned(s) => s,
        std::borrow::Cow::Borrowed(_) => cleaned_urls,
    }
}

pub fn calculate_spoiler_amount(text: &str) -> f64 {
    let mut total_chars = 0;
    let mut inside_char_count = 0;
    let mut inside = false;
    let mut chars = text.chars().peekable();

    // Scan through characters in a single O(N) pass
    while let Some(c) = chars.next() {
        if c == '|' && chars.peek() == Some(&'|') {
            chars.next(); // Consume the second '|'
            inside = !inside;
            total_chars += 2;
        } else {
            total_chars += 1;
            if inside {
                inside_char_count += 1;
            }
        }
    }

    if total_chars == 0 {
        return 0.0;
    }

    inside_char_count as f64 / total_chars as f64
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

pub fn amount_of_uppercase(input: &str) -> f64 {
    let mut total_chars = 0;
    let mut uppercase_count = 0;

    for c in input.chars() {
        total_chars += 1;
        if c.is_uppercase() {
            uppercase_count += 1;
        }
    }

    if total_chars == 0 {
        return 0.0;
    }

    uppercase_count as f64 / total_chars as f64
}

pub fn get_rustrict_categories(analysis: &Type) -> Vec<&str> {
    let mut categories = Vec::with_capacity(6);

    if analysis.is(Type::PROFANE) {
        categories.push("Profane");
    }
    if analysis.is(Type::OFFENSIVE) {
        categories.push("Offensive");
    }
    if analysis.is(Type::SEXUAL) {
        categories.push("Sexual");
    }
    if analysis.is(Type::MEAN) {
        categories.push("Mean");
    }
    if analysis.is(Type::EVASIVE) {
        categories.push("Evasive");
    }
    if analysis.is(Type::SPAM) {
        categories.push("Spam");
    }

    categories
}

pub fn any_breaking_rule_domain<'a>(external_links: &ExternalLinksRule, urls: &[&'a str]) -> Option<&'a str> {
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