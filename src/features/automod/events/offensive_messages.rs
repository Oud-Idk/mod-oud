use super::super::rules::check_rule;
use crate::features::automod::patterns::DISCORD_EMOJI_MENTION_REGEX;
use crate::features::automod::types::FilterVerdict;
use crate::features::automod::types::MessageFilteringConfig;
use crate::shared::messages;
use rustrict::{Censor, Type};
use serenity::all::Message;
use std::borrow::Cow;
use tracing::{debug, trace};

pub fn filter_offensive_messages<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(offensive_rule) = check_rule(filtering.offensive_messages.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Offensive Messages' filter rule");
    let cleaned_content = clean_message_content(&message.content);
    let analysis = Censor::from_str(&cleaned_content).analyze();

    let flag_threshold = offensive_rule.flag_threshold;
    if !analysis.is(flag_threshold.to_type()) {
        return FilterVerdict::Pass;
    }

    let categories = get_rustrict_categories(&analysis);
    let trigger_content = if categories.is_empty() {
        None
    } else {
        Some(Cow::Owned(categories.join(", ")))
    };

    debug!(?categories, "Message flagged by Offensive Messages filter");
    FilterVerdict::Block {
        rule_name: "Offensive Message".into(),
        base_rule: Cow::Borrowed(&offensive_rule.base),
        trigger_content,
        custom_dm_message: None,
    }
}

fn get_rustrict_categories(analysis: &Type) -> Vec<&str> {
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

/// Cleans raw text of URLs and specific Discord formatting elements.
pub fn clean_message_content(content: &str) -> String {
    let (cleaned_urls, _) = messages::remove_urls(content);

    // Avoid allocating a duplicate string if no regex replacement was needed
    match DISCORD_EMOJI_MENTION_REGEX.replace_all(&cleaned_urls, "") {
        std::borrow::Cow::Owned(s) => s,
        std::borrow::Cow::Borrowed(_) => cleaned_urls,
    }
}
