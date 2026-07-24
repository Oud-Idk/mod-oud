use std::borrow::Cow;
use serenity::all::Message;
use tracing::{debug, trace};
use crate::features::automod::patterns::INVITE_REGEX;
use crate::features::automod::types::FilterVerdict;
use crate::features::automod::types::{HasBaseRule, MessageFilteringConfig};
use super::super::rules::check_rule;

pub fn filter_server_invites<'a>(
    message: &'a Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(server_invites) = check_rule(filtering.server_invites.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Server Invites' filter rule");
    if let Some(captures) = INVITE_REGEX.captures(&message.content) {
        let matched_link = captures.get(0).map(|m| Cow::Borrowed(m.as_str()));

        debug!(matched_link = ?matched_link, "Message flagged by Server Invites filter");
        return FilterVerdict::Block {
            rule_name: "Server Invites".into(),
            base_rule: Cow::Borrowed(server_invites.base()),
            trigger_content: matched_link,
            custom_dm_message: None,
        };
    }

    FilterVerdict::Pass
}