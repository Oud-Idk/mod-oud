use crate::core::config::state::BotData;
use crate::features::automod::cache::get_rule_name;
use crate::features::automod::database::AutomodEntryRow;
use crate::features::automod::insert_automod_row;
use crate::features::automod::types::LoggedAction;
use anyhow::Result;
use serenity::{
    all::{ActionExecution, Context},
    model::id::{ChannelId, MessageId},
};

/// Persists an `AutoMod` rule execution event into the database for logging and auditing.
///
/// # Arguments
/// * `ctx` - Serenity framework context used for Discord API fallbacks when fetching rule names.
/// * `execution` - The `AutoMod` [`ActionExecution`] event payload containing details about the rule trigger.
/// * `data` - Shared bot state providing database and Redis handles.
///
/// # Errors
/// Returns an error if fetching the rule name fails or if the database insertion query encounters an error.
pub async fn store_automod(
    ctx: &Context,
    execution: &ActionExecution,
    data: &BotData,
) -> Result<()> {
    let db = &data.core.db;
    let redis = &data.core.redis;

    let action = LoggedAction::from(&execution.action)
        .as_str()
        .to_ascii_uppercase();
    let rule_name = get_rule_name(ctx, redis, &execution.guild_id, execution.rule_id).await;

    let entry = AutomodEntryRow {
        guild_id: execution.guild_id.get(),
        user_id: execution.user_id.get(),
        channel_id: execution.channel_id.map(ChannelId::get),
        message_id: execution.message_id.map(MessageId::get),
        rule_name: &rule_name,
        trigger_content: execution.matched_content.as_deref(),
        original_content: Some(execution.content.as_str()),
        actions_taken: &[&action],
    };

    insert_automod_row(db, entry).await?;

    Ok(())
}
