use crate::core::config::state::{BotData, Error};
use crate::features::automod::actions::{RuleActionPayload, execute_rule_actions};
use crate::features::automod::types::{AntiSpamRule, MessageFilteringConfig};
use serenity::all::Message;
use std::time::Duration;

async fn handle_spam(
    ctx: &serenity::all::Context,
    message: &Message,
    data: &BotData,
    guild_id: u64,
    author_id: u64,
    warning_cooldown: Duration,
    anti_spam_rule: &AntiSpamRule,
) -> Result<(), Error> {
    let should_warn = data
        .security
        .spam_tracker
        .check_warning_cooldown_async(guild_id, author_id, warning_cooldown)
        .await?;

    let payload = RuleActionPayload {
        base: &anti_spam_rule.base,
        rule_name: "Anti Spam",
        trigger_content: None,
        custom_dm_message: None,
        should_warn: Some(should_warn),
    };

    execute_rule_actions(ctx, data, message, payload).await;

    Ok(())
}

/// Checks the spam tracker and handles deletions/warnings if the limit is exceeded.
/// Returns `Ok(true)` if spam was detected, indicating execution should stop.
pub async fn handle_spam_prevention(
    ctx: &serenity::all::Context,
    message: &Message,
    data: &BotData,
    filtering: &MessageFilteringConfig,
    guild_id: u64,
    author_id: u64,
) -> Result<bool, Error> {
    let Some(anti_spam) = &filtering.anti_spam else {
        return Ok(false);
    };

    let spam_limit = anti_spam.messages_per_window;
    let spam_window = Duration::from_secs(anti_spam.window_seconds);
    let warning_cooldown = Duration::from_secs(5);

    let is_spamming = data
        .security
        .spam_tracker
        .check_and_record_async(guild_id, author_id, spam_limit as usize, spam_window)
        .await?;

    if is_spamming {
        handle_spam(
            ctx,
            message,
            data,
            guild_id,
            author_id,
            warning_cooldown,
            anti_spam,
        )
        .await?;
        return Ok(true);
    }

    Ok(false)
}
