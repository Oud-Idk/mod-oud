use super::super::rules::check_rule;
use super::offensive_messages::clean_message_content;
use crate::core::config::state::BotData;
use crate::features::automod::ToxicClassifierJob;
use crate::features::automod::types::{FilterVerdict, HasBaseRule, MessageFilteringConfig};
use serenity::all::Message;
use std::borrow::Cow;
use tokio::sync::oneshot;
use tracing::{debug, error};

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

    if let Err(e) = data
        .toxic_classifier_tx
        .send(ToxicClassifierJob {
            text,
            respond_to: reply_tx,
        })
        .await
    {
        error!(%e, "send classification request");
        return FilterVerdict::Pass;
    }

    let scores = match reply_rx.await {
        Ok(Ok(scores)) => scores,
        Ok(Err(e)) => {
            error!(%e, content = %message.content, "classifying text");
            return FilterVerdict::Pass;
        }
        Err(e) => {
            error!(%e, "receiving reply from worker");
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
