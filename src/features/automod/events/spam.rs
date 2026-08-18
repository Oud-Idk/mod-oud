use crate::core::config::state::{BotData};
use crate::features::automod::actions::{RuleActionPayload, execute_rule_actions};
use crate::features::automod::types::{AntiSpamRule, MessageFilteringConfig};
use serenity::all::{Context, Message};
use serenity::model::id::{GuildId, UserId};
use std::time::Duration;
use anyhow::Result;

async fn handle_spam(
    ctx: &Context,
    message: &Message,
    data: &BotData,
    guild_id: GuildId,
    author_id: UserId,
    warning_cooldown: Duration,
    anti_spam_rule: &AntiSpamRule,
) -> Result<()> {
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
    ctx: &Context,
    message: &Message,
    data: &BotData,
    filtering: &MessageFilteringConfig,
    guild_id: GuildId,
    author_id: UserId,
) -> Result<bool> {
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
