use std::borrow::Cow;
use serenity::all::Message;
use tracing::{debug, trace};
use unicode_segmentation::UnicodeSegmentation;
use crate::features::automod::patterns::DISCORD_EMOJI_REGEX;
use crate::features::automod::types::FilterVerdict;
use crate::features::automod::types::MessageFilteringConfig;
use super::super::rules::check_rule;

pub fn filter_excessive_emojis<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(excessive_emojis) = check_rule(filtering.excessive_emojis.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Excessive Emojis' filter rule");
    let total_count = count_emojis(&message.content) + DISCORD_EMOJI_REGEX.find_iter(&message.content).count();

    if total_count > excessive_emojis.max_emojis as usize {
        debug!(emoji_count = total_count, threshold = excessive_emojis.max_emojis, "Message flagged by Excessive Emojis filter");
        return FilterVerdict::Block {
            rule_name: "Excessive Emojis".into(),
            base_rule: Cow::Borrowed(&excessive_emojis.base),
            trigger_content: None,
            custom_dm_message: None,
        };
    }

    FilterVerdict::Pass
}

pub fn count_emojis(text: &str) -> usize {
    text.graphemes(true)
        .filter(|grapheme| emojis::get(grapheme).is_some())
        .count()
}