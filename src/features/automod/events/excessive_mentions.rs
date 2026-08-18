use super::super::rules::check_rule;
use crate::features::automod::patterns::DISCORD_PING_REGEX;
use crate::features::automod::types::FilterVerdict;
use crate::features::automod::types::MessageFilteringConfig;
use serenity::all::Message;
use std::borrow::Cow;
use tracing::{debug, trace};

pub fn filter_excessive_mentions<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(excessive_mentions) = check_rule(filtering.excessive_mentions.as_ref(), message)
    else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Excessive Mentions' filter rule");
    let discord_count = DISCORD_PING_REGEX.find_iter(&message.content).count();
    if discord_count > excessive_mentions.max_mentions as usize {
        debug!(
            mention_count = discord_count,
            threshold = excessive_mentions.max_mentions,
            "Message flagged by Excessive Mentions filter"
        );
        return FilterVerdict::Block {
            rule_name: "Excessive Mentions".into(),
            base_rule: Cow::Borrowed(&excessive_mentions.base),
            trigger_content: None,
            custom_dm_message: None,
        };
    }

    FilterVerdict::Pass
}
