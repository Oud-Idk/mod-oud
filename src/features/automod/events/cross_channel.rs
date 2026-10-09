use crate::core::config::state::BotData;
use crate::features::automod::actions::{RuleActionPayload, execute_rule_actions};
use crate::features::automod::duplicate_tracker::{self, DuplicateHit, DuplicateVerdict};
use crate::features::automod::rules::check_rule;
use crate::features::automod::types::MessageFilteringConfig;
use anyhow::Result;
use futures::future::join_all;
use serenity::all::{Context, Message};
use serenity::model::id::{GuildId, UserId};
use std::time::Duration;
use tracing::warn;

const WARNING_COOLDOWN: Duration = Duration::from_secs(5);

/// Checks whether the same text has been posted across too many channels, and
/// handles the configured actions if it has.
///
/// Returns `Ok(true)` if the rule tripped, indicating execution should stop.
pub async fn handle_cross_channel_spam(
    ctx: &Context,
    message: &Message,
    data: &BotData,
    filtering: &MessageFilteringConfig,
    guild_id: GuildId,
    author_id: UserId,
) -> Result<bool> {
    let Some(rule) = check_rule(filtering.cross_channel_spam.as_ref(), message) else {
        return Ok(false);
    };

    let verdict = duplicate_tracker::check_and_record(
        &data.core.redis,
        guild_id,
        author_id,
        message.channel_id,
        message.id,
        &message.content,
        rule,
    )
    .await?;

    let DuplicateVerdict::Trip { hits } = verdict else {
        return Ok(false);
    };

    // Independent of the action list, which governs the triggering message.
    // Delete-with-Warn is a valid pair: purge the trail, leave the latest.
    if let Some(limit @ 1..) = rule.prior_copies.delete_limit() {
        delete_matched_copies(ctx, message, &hits, limit).await;
    }

    // Cleared regardless of the purge flag. Leaving the hits in the window would
    // let the next message trip on the same three channels without the author
    // posting anything new.
    if let Err(error) =
        duplicate_tracker::forget_copies(&data.core.redis, guild_id, author_id, &hits).await
    {
        warn!(error = %error, "duplicate window entries not cleared");
    }

    let should_warn = data
        .security
        .spam_tracker
        .check_warning_cooldown_async(guild_id, author_id, WARNING_COOLDOWN)
        .await?;

    let payload = RuleActionPayload {
        base: &rule.base,
        rule_name: "Cross Channel Spam",
        trigger_content: None,
        custom_dm_message: None,
        should_warn: Some(should_warn),
    };

    execute_rule_actions(ctx, data, message, payload).await;

    Ok(true)
}

/// Deletes the matched copies in the channels other than the one that tripped.
///
/// `hits` arrives newest first and holds one entry per channel, so the limit is
/// a count of channels and truncating up front bounds the concurrent requests.
/// `limit` is `u32::MAX` when the policy is uncapped.
///
/// The bulk delete endpoint is useless here: the copies are in distinct channels
/// by definition, so each is its own request. They run concurrently so one
/// missing permission does not serialize behind the rest.
async fn delete_matched_copies(
    ctx: &Context,
    message: &Message,
    hits: &[DuplicateHit],
    limit: u32,
) {
    let cap = usize::try_from(limit).unwrap_or(usize::MAX);
    let deletes = hits
        .iter()
        // The triggering message is handled by the configured actions.
        .filter(|hit| hit.message_id != message.id)
        .take(cap)
        .map(|hit| {
            let channel_id = hit.channel_id;
            let message_id = hit.message_id;
            let http = ctx.http.clone();
            async move {
                (
                    channel_id,
                    message_id,
                    channel_id.delete_message(&http, message_id).await,
                )
            }
        });

    for (channel_id, message_id, result) in join_all(deletes).await {
        // Missing Manage Messages in a channel is the common case and needs a
        // moderator to notice, so this is a warn rather than a debug.
        if let Err(error) = result {
            warn!(
                error = %error,
                %channel_id,
                %message_id,
                "duplicate copy not deleted"
            );
        }
    }
}
