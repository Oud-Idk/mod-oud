use crate::types::flag::FlagSeverity;
use crate::types::types::{Context, Data, Error};
use poise::serenity_prelude as serenity;

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "varchar", rename_all = "snake_case")] // Adjust based on your DB setup
pub enum ActionType {
    Warn,
    DeleteWarning,
    Mute,
    Unmute,
    Kick,
    Ban,
    Unban,
    Softban,
    Lock,
    Pardon,
    Unpardon,
    Unlock,
    GlobalLock,
    GlobalUnlock,
}

pub async fn log_moderation_action(
    ctx: &Context<'_>,
    guild_id: u64,
    target_id: u64,
    moderator_id: u64,
    action_type: ActionType,
    reason: Option<&str>,
    duration: Option<&str>,
) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO moderation_logs (guild_id, target_id, moderator_id, action_type, reason, duration)
         VALUES ($1, $2, $3, $4, $5, $6)",
        guild_id as i64,
        target_id as i64,
        moderator_id as i64,
        action_type as ActionType,
        reason,
        duration
    )
        .execute(&ctx.data().db)
        .await?;

    Ok(())
}

pub async fn log_offensive_message(
    ctx: &serenity::Context,
    data: &Data,
    guild_id: u64,
    channel_id: u64,
    message_id: u64,
    author_id: u64,
    content: &str,
    flag_type: FlagSeverity,
) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO flagged_messages (guild_id, channel_id, message_id, author_id, content, flag_type)
         VALUES ($1, $2, $3, $4, $5, $6)",
        guild_id as i64,
        channel_id as i64,
        message_id as i64,
        author_id as i64,
        content,
        flag_type.to_string(),
    )
        .execute(&data.db)
        .await?;

    Ok(())
}

pub async fn log_scam_message(
    ctx: &serenity::Context,
    data: &Data,
    guild_id: u64,
    channel_id: u64,
    message_id: u64,
    author_id: u64,
    content: &str,
    flag_type: &[i32],
) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO scam_messages (guild_id, channel_id, message_id, author_id, content, flag_type)
         VALUES ($1, $2, $3, $4, $5, $6)",
        guild_id as i64,
        channel_id as i64,
        message_id as i64,
        author_id as i64,
        content,
        flag_type,
    )
        .execute(&data.db)
        .await?;

    Ok(())
}

pub async fn log_spam_message(
    ctx: &serenity::Context,
    data: &Data,
    guild_id: u64,
    channel_id: u64,
    message_id: u64,
    author_id: u64,
    content: &str,
) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO spammed_messages (guild_id, channel_id, message_id, author_id, content)
         VALUES ($1, $2, $3, $4, $5)",
        guild_id as i64,
        channel_id as i64,
        message_id as i64,
        author_id as i64,
        content,
    )
        .execute(&data.db)
        .await?;

    Ok(())
}
