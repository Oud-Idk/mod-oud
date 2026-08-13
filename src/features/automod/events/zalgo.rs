use std::borrow::Cow;
use serenity::all::Message;
use tracing::{debug, trace};
use crate::features::automod::types::FilterVerdict;
use crate::features::automod::types::MessageFilteringConfig;
use super::super::rules::check_rule;

pub fn filter_zalgo<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(zalgo) = check_rule(filtering.zalgo.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Zalgo' filter rule");
    if is_zalgo_grapheme(&message.content, 3) {
        debug!("Message flagged by Zalgo filter");
        return FilterVerdict::Block {
            rule_name: "Zalgo".into(),
            base_rule: Cow::Borrowed(zalgo),
            trigger_content: None,
            custom_dm_message: None,
        };
    }

    FilterVerdict::Pass
}

const fn is_combining_mark(c: char) -> bool {
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