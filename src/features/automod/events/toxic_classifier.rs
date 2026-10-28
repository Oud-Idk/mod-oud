use super::super::rules::check_rule;
use super::offensive_messages::clean_message_content;
use crate::core::config::state::BotData;
use crate::features::automod::types::{FilterVerdict, HasBaseRule, MessageFilteringConfig};
use serenity::all::Message;
use std::borrow::Cow;
use std::time::Duration;
use tracing::{debug, error, warn};

/// How long a message waits for a classification result before being passed through.
const CLASSIFICATION_REPLY_TIMEOUT: Duration = Duration::from_secs(5);

pub async fn filter_toxic_classifier<'a>(
    message: &'a Message,
    filtering: &'a MessageFilteringConfig,
    data: &BotData,
) -> FilterVerdict<'a> {
    let Some(rule) = check_rule(filtering.toxic_message_classifier.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    let Some(classifier) = data.toxic_classifier.as_ref() else {
        return FilterVerdict::Pass;
    };

    if !classifier.is_ready() {
        debug!("toxic classifier rule enabled but the model is not loaded");
        return FilterVerdict::Pass;
    }

    let text = clean_message_content(&message.content).into_owned();

    let scores =
        match tokio::time::timeout(CLASSIFICATION_REPLY_TIMEOUT, classifier.classify(text)).await {
            Ok(Ok(scores)) => scores,
            Ok(Err(e)) => {
                error!(error = %e, "toxic classification failed");
                return FilterVerdict::Pass;
            }
            Err(_) => {
                warn!("toxic classifier timed out");
                return FilterVerdict::Pass;
            }
        };

    let breached = rule.breached_categories(&scores);
    if breached.is_empty() {
        return FilterVerdict::Pass;
    }

    debug!(?breached, "message flagged by Toxic Message Classifier");
    FilterVerdict::Block {
        rule_name: "Toxic Message Classification".into(),
        base_rule: Cow::Borrowed(rule.base()),
        trigger_content: Some(Cow::Owned(breached.join(", "))),
        custom_dm_message: None,
    }
}
