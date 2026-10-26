use super::super::rules::check_rule;
use super::offensive_messages::clean_message_content;
use crate::core::config::state::BotData;
use crate::features::automod::ToxicClassifierJob;
use crate::features::automod::types::{FilterVerdict, HasBaseRule, MessageFilteringConfig};
use serenity::all::Message;
use std::borrow::Cow;
use std::time::Duration;
use tokio::sync::oneshot;
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

    if !crate::features::automod::toxic_classifier_ready() {
        debug!("toxic classifier rule enabled but the model is not loaded");
        return FilterVerdict::Pass;
    }

    let (reply_tx, reply_rx) = oneshot::channel();
    let text = clean_message_content(&message.content).into_owned();

    if let Err(e) = data.toxic_classifier_tx.try_send(ToxicClassifierJob {
        text,
        respond_to: reply_tx,
    }) {
        warn!(%e, "toxic classifier queue unavailable, skipping classification");
        return FilterVerdict::Pass;
    }

    let scores = match tokio::time::timeout(CLASSIFICATION_REPLY_TIMEOUT, reply_rx).await {
        Ok(Ok(Ok(scores))) => scores,
        Ok(Ok(Err(e))) => {
            error!(%e, "classifying text");
            return FilterVerdict::Pass;
        }
        Ok(Err(e)) => {
            error!(%e, "receiving reply from worker");
            return FilterVerdict::Pass;
        }
        Err(_) => {
            warn!(content = %message.content, "toxic classifier timed out");
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
