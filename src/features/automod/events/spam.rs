use crate::features::automod;
use crate::features::automod::types::{AntiSpamRule, MessageFilteringConfig};
use crate::{Data, Error};
use serenity::all::Message;
use std::time::Duration;

async fn handle_spam(ctx: &serenity::all::Context, message: &Message, data: &Data, guild_id: u64, author_id: u64, warning_cooldown: Duration, anti_spam_rule: &AntiSpamRule) -> Result<(), Error> {
    let should_warn = data
        .spam_tracker
        .check_warning_cooldown_async(guild_id, author_id, warning_cooldown)
        .await?;

    automod::actions::execute_rule_actions(
        ctx,
        data,
        message,
        &anti_spam_rule.base,
        "Anti Spam",
        None,
        None,
        Some(should_warn),
    )
        .await;

    Ok(())
}

/// Checks the spam tracker and handles deletions/warnings if the limit is exceeded.
/// Returns `Ok(true)` if spam was detected, indicating execution should stop.
pub async fn handle_spam_prevention(
    ctx: &serenity::all::Context,
    message: &Message,
    data: &Data,
    filtering: &MessageFilteringConfig, // Passed configuration reference
    guild_id: u64,
    author_id: u64,
) -> Result<bool, Error> {
    let Some(anti_spam) = &filtering.anti_spam else { return Ok(false); };

    let spam_limit = anti_spam.messages_per_window;
    let spam_window = Duration::from_secs(anti_spam.window_seconds);
    let warning_cooldown = Duration::from_secs(5);

    let is_spamming = data
        .spam_tracker
        .check_and_record_async(guild_id, author_id, spam_limit as usize, spam_window)
        .await?;

    if is_spamming {
        handle_spam(ctx, &message, data, guild_id, author_id, warning_cooldown, anti_spam).await?;
        return Ok(true);
    }

    Ok(false)
}