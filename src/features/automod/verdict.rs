use crate::core::config::state::{BotData, Error};
use crate::features::automod::actions::{RuleActionPayload, execute_rule_actions};
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
    } = verdict
    else {
        return Ok(false);
    };

    let payload = RuleActionPayload {
        base: base_rule.as_ref(),
        rule_name: rule_name.as_ref(),
        trigger_content: trigger_content.as_deref(),
        custom_dm_message: custom_dm_message.as_deref(),
        should_warn: None,
    };

    execute_rule_actions(ctx, data, message, payload).await;

    Ok(true) // Violation occurred and was handled
}
