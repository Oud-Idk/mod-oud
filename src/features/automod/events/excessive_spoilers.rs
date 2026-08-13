use super::super::rules::check_rule;
use crate::features::automod::types::FilterVerdict;
use crate::features::automod::types::MessageFilteringConfig;
use serenity::all::Message;
use std::borrow::Cow;
use tracing::{debug, trace};

pub fn filter_excessive_spoilers<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(excessive_spoilers) = check_rule(filtering.excessive_spoilers.as_ref(), message)
    else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Excessive Spoilers' filter rule");
    let amount = calculate_spoiler_amount(&message.content);
    if amount > excessive_spoilers.threshold {
        debug!(
            spoiler_count = amount,
            threshold = excessive_spoilers.threshold,
            "Message flagged by Excessive Spoilers filter"
        );
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
    let mut chars = text.chars().peekable(); // Make it peekable for efficient iteration

    while let Some(c) = chars.next() {
        // Sees if current `c` is `|` and see if the next character `chars.peek()` is `|`
        if c == '|' && chars.peek() == Some(&'|') {
            chars.next(); // Skips to the next `|`
            inside = !inside; // Flips the spoiler state
            total_chars += 2; // Count the pipes as total characters
        } else {
            total_chars += 1;
            if inside {
                inside_char_count += 1;
            }
        }
    }

    // Short circuit if no spoilers count to prevent division by zero
    if total_chars == 0 {
        return 0.0;
    }

    f64::from(inside_char_count) / f64::from(total_chars)
}
