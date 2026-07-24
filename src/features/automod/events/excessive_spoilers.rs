use std::borrow::Cow;
use serenity::all::Message;
use tracing::{debug, trace};
use crate::features::automod::types::FilterVerdict;
use crate::features::automod::types::MessageFilteringConfig;
use super::super::rules::check_rule;

pub fn filter_excessive_spoilers<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(excessive_spoilers) = check_rule(filtering.excessive_spoilers.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Excessive Spoilers' filter rule");
    let amount = calculate_spoiler_amount(&message.content);
    if amount > excessive_spoilers.threshold {
        debug!(spoiler_count = amount, threshold = excessive_spoilers.threshold, "Message flagged by Excessive Spoilers filter");
        return FilterVerdict::Block {
            rule_name: "Excessive Spoiler".into(),
            base_rule: Cow::Borrowed(&excessive_spoilers.base),
            trigger_content: None,
            custom_dm_message: None,
        };
    }

    FilterVerdict::Pass
}

pub fn calculate_spoiler_amount(text: &str) -> f64 {
    let mut total_chars = 0;
    let mut inside_char_count = 0;
    let mut inside = false;
    let mut chars = text.chars().peekable();

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