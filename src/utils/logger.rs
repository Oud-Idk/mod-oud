use std::fmt;

// Updated the import here from get_guild_config to get_settings
use crate::core::config::get_settings;
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
// Updated the import here from get_guild_config to get_settings
use crate::types::{Context, Data, Error};

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

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, poise::ChoiceParameter, Serialize, Deserialize,
)]
#[sqlx(type_name = "flag_severity", rename_all = "UPPERCASE")]
pub enum FlagSeverity {
    #[name = "Mild"]
    Mild,
    #[name = "Moderate"]
    Moderate,
    #[name = "Severe"]
    Severe,
}

impl FlagSeverity {
    /// Helper to map the rustrict analysis to our custom enum
    pub fn from_analysis(analysis: rustrict::Type) -> Option<Self> {
        if analysis.is(rustrict::Type::SEVERE) {
            Some(FlagSeverity::Severe)
        } else if analysis.is(rustrict::Type::MODERATE) {
            Some(FlagSeverity::Moderate)
        } else if analysis.is(rustrict::Type::MILD) {
            Some(FlagSeverity::Mild)
        } else {
            None
        }
    }

    /// Explicitly provide the string name
    pub fn name(&self) -> &'static str {
        match self {
            FlagSeverity::Mild => "Mild",
            FlagSeverity::Moderate => "Moderate",
            FlagSeverity::Severe => "Severe",
        }
    }
}

impl fmt::Display for FlagSeverity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            FlagSeverity::Mild => "MILD",
            FlagSeverity::Moderate => "MODERATE",
            FlagSeverity::Severe => "SEVERE",
        };
        write!(f, "{}", label)
    }
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
    let settings = get_settings(&ctx.data().db, guild_id as i64).await?;

    // 3. Dispatch the log message to the Discord logging channel if configured
    if let Some(log_channel_raw) = settings.general_bot_logs_id {
        let log_channel = serenity::ChannelId::new(log_channel_raw as u64);

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

pub async fn log_flagged_message(
    ctx: &serenity::Context,
    data: &Data,
    guild_id: u64,
    channel_id: u64,
    message_id: u64,
    author_id: u64,
    content: &str,
    flag_type: FlagSeverity,
) -> Result<(), Error> {
    // 1. Write the flagged message entry to the database
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

    // 2. Fetch guild settings (JSONB-based)
    let settings = get_settings(&data.db, guild_id as i64).await?;

    if let Some(log_channel_raw) = settings.message_log_channel_id {
        let log_channel = serenity::ChannelId::new(log_channel_raw as u64);

        let log_embed = serenity::CreateEmbed::new()
            .title("Flagged Message Detected")
            .color(0xD9534F) // Alert red
            .field("Author", format!("<@{}>", author_id), true)
            .field("Channel", format!("<#{}>", channel_id), true)
            .field("Flag Reason", flag_type.to_string(), true)
            .field("Content", format!("```\n{}\n```", content), false)
            .timestamp(serenity::Timestamp::now());

        let _ = log_channel
            .send_message(&ctx.http, serenity::CreateMessage::new().embed(log_embed))
            .await;
    }

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
    // 1. Write the spam entry to the dedicated table
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

    // 2. Fetch guild settings
    let settings = get_settings(&data.db, guild_id as i64).await?;

    if let Some(log_channel_raw) = settings.message_log_channel_id {
        let log_channel = serenity::ChannelId::new(log_channel_raw as u64);

        let log_embed = serenity::CreateEmbed::new()
            .title("Spam Detected")
            .color(0xF0AD4E) // Amber alert color
            .field("Author", format!("<@{}>", author_id), true)
            .field("Channel", format!("<#{}>", channel_id), true)
            .field("Reason", "Rate limit exceeded", true)
            .field("Content", format!("```\n{}\n```", content), false)
            .timestamp(serenity::Timestamp::now());

        let _ = log_channel
            .send_message(&ctx.http, serenity::CreateMessage::new().embed(log_embed))
            .await;
    }

    Ok(())
}
