use std::borrow::Cow;
use serenity::all::Message;
use tracing::{debug, trace};
use crate::features::automod::types::FilterVerdict;
use crate::features::automod::types::MessageFilteringConfig;
use super::super::rules::check_rule;

pub fn filter_excessive_caps<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(excessive_caps) = check_rule(filtering.excessive_caps.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Excessive Caps' filter rule");
    if message.content.chars().count() < excessive_caps.min_length as usize { return FilterVerdict::Pass; }
    let count = amount_of_uppercase(message.content.as_str());

    if excessive_caps.threshold >= count {
        return FilterVerdict::Pass;
    }

    debug!(caps_count = count, threshold = excessive_caps.threshold, "Message flagged by Excessive Caps filter");
    FilterVerdict::Block {
        rule_name: "Excessive Caps".into(),
        base_rule: Cow::Borrowed(&excessive_caps.base),
        trigger_content: None,
        custom_dm_message: None,
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

    f64::from(uppercase_count) / f64::from(total_chars)
}