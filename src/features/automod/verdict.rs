use crate::core::config::state::{BotData, Error};
use crate::features::automod;
use crate::features::automod::types::FilterVerdict;
use serenity::all::Message;

pub async fn execute_verdict(
    ctx: &serenity::all::Context,
    data: &BotData,
    message: &Message,
    verdict: FilterVerdict<'_>,
) -> Result<bool, Error> {
    let FilterVerdict::Block {
        rule_name,
        base_rule,
        trigger_content,
        custom_dm_message,
    } = verdict else {
        return Ok(false);
    };

    automod::actions::execute_rule_actions(
        ctx,
        data,
        message,
        base_rule.as_ref(),
        rule_name.as_ref(),
        trigger_content.as_deref(),
        custom_dm_message.as_deref(),
        None,
    )
        .await;

    Ok(true) // Violation occurred and was handled
}