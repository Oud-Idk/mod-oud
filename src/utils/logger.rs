use crate::core::config::get_settings;
use crate::types::flag::{FlagSeverity, ThreatType};
use crate::types::types::{Context, Data, Error, LogConfig};
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
    // 1. Write to the database
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

    // 2. Query dynamic guild settings from the database (JSONB-based)
    let settings = get_settings(&ctx.data().db, &ctx.data().redis, guild_id as i64).await?;

    // 3. Dispatch the log message to the Discord logging channel if configured
    if let Some(log_channel_raw) = settings.general_bot_logs_id {
        let log_channel = serenity::ChannelId::new(log_channel_raw.parse::<u64>()?);

        let title = "Moderation Action Logged";
        let color = 0x7289DA;

        let mut log_embed = serenity::CreateEmbed::new()
            .title(title)
            .color(color)
            .timestamp(serenity::Timestamp::now());

        // Match directly on the enum variants instead of raw strings
        let target_mention = match action_type {
            ActionType::Lock | ActionType::Unlock => format!("<#{}>", target_id),
            ActionType::GlobalLock | ActionType::GlobalUnlock => "Entire Server".to_string(),
            _ => format!("<@{}>", target_id),
        };

        log_embed = log_embed.field("Target", target_mention, true);
        log_embed = log_embed.field("Moderator", format!("<@{}>", moderator_id), true);

        if let Some(res) = reason {
            log_embed = log_embed.field("Reason", res.to_string(), false);
        }
        if let Some(dur) = duration {
            log_embed = log_embed.field("Duration", dur.to_string(), false);
        }

        let _ = log_channel
            .send_message(ctx.http(), serenity::CreateMessage::new().embed(log_embed))
            .await;
    }

    Ok(())
}

async fn send_discord_log(
    ctx: &serenity::Context,
    data: &Data,
    guild_id: u64,
    channel_id: u64,
    author_id: u64,
    content: &str,
    config: LogConfig,
) -> Result<(), Error> {
    let settings = get_settings(&data.db, &data.redis, guild_id as i64).await?;

    if let Some(log_channel_raw) = settings.message_log_channel_id {
        let log_channel = serenity::ChannelId::new(log_channel_raw.parse::<u64>()?);

        let log_embed = serenity::CreateEmbed::new()
            .title(config.title)
            .color(config.color)
            .field("Author", format!("<@{}>", author_id), true)
            .field("Channel", format!("<#{}>", channel_id), true)
            .field(config.reason_label, config.reason_value, true)
            .field("Content", format!("```\n{}\n```", content), false)
            .timestamp(serenity::Timestamp::now());

        let _ = log_channel
            .send_message(&ctx.http, serenity::CreateMessage::new().embed(log_embed))
            .await;
    }

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

    send_discord_log(
        ctx,
        data,
        guild_id,
        channel_id,
        author_id,
        content,
        LogConfig {
            title: "Flagged Message Detected",
            color: 0xD9534F,
            reason_label: "Flag Reason",
            reason_value: flag_type.to_string(),
        },
    )
        .await
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

    let reasons = flag_type
        .iter()
        .map(|v| format!("{}", ThreatType::from(*v)))
        .collect::<Vec<String>>();

    send_discord_log(
        ctx,
        data,
        guild_id,
        channel_id,
        author_id,
        content,
        LogConfig {
            title: "Scam Detected",
            color: 0xD9534F,
            reason_label: "Flag Reason",
            reason_value: reasons.join(", "),
        },
    )
        .await
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

    send_discord_log(
        ctx,
        data,
        guild_id,
        channel_id,
        author_id,
        content,
        LogConfig {
            title: "Spam Detected",
            color: 0xF0AD4E,
            reason_label: "Reason",
            reason_value: "Rate limit exceeded".to_string(),
        },
    )
        .await
}
