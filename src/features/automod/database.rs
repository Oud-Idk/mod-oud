use anyhow::{Context, Result};
use serenity::all::{ChannelId, GuildId, Message, MessageId, UserId};

/// Represents a row of data for an Automod event log to be inserted into the database.
pub struct AutomodEntryRow<'a> {
    /// The ID of the Discord guild (server) where the event occurred.
    pub guild_id: GuildId,

    /// The ID of the user who triggered the Automod rule.
    pub user_id: UserId,

    /// The ID of the Discord channel where the trigger occurred, if applicable.
    pub channel_id: Option<ChannelId>,

    /// The ID of the message that triggered the rule, if the event was message-based.
    pub message_id: Option<MessageId>,

    /// The name, type, or identifier of the Automod rule that was triggered.
    pub rule_name: &'a str,

    /// The specific keyword, regex match, or payload segment that tripped the rule, if available.
    pub trigger_content: Option<&'a str>,

    /// The complete original message or input content prior to any moderation action.
    pub original_content: Option<&'a str>,

    /// A list of actions executed in response to the rule trigger.
    pub actions_taken: &'a [&'a str],
}

/// Logs an automod action execution event to the database.
///
/// # Errors
///
/// Returns an [`Err`] if the SQL query execution fails.
pub async fn insert_automod_row(db: &sqlx::PgPool, entry: AutomodEntryRow<'_>) -> Result<()> {
    let actions_vec: Vec<String> = entry.actions_taken.iter().map(|&a| a.to_string()).collect();

    sqlx::query!(
        r#"
        INSERT INTO automod_logs (
            guild_id, user_id, channel_id, message_id,
            rule_type, trigger_content, original_content, actions_taken
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
        entry.guild_id.get().cast_signed(),
        entry.user_id.get().cast_signed(),
        entry.channel_id.map(|id| id.get().cast_signed()),
        entry.message_id.map(|id| id.get().cast_signed()),
        entry.rule_name,
        entry.trigger_content,
        entry.original_content,
        &actions_vec,
    )
    .execute(db)
    .await?;

    Ok(())
}

/// Helper to construct and log an automod incident directly from a flagged [`Message`].
///
/// Skips logging if the message was sent outside of a guild context (e.g. in DMs).
///
/// # Errors
///
/// Returns an [`Err`] if database insertion fails.
pub async fn log_automod_event(
    db: &sqlx::PgPool,
    message: &Message,
    rule_name: &str,
    trigger_content: Option<&str>,
    actions_taken: &[&'static str],
) -> Result<()> {
    let Some(guild_id) = message.guild_id else {
        return Ok(());
    };

    let entry = AutomodEntryRow {
        guild_id,
        user_id: message.author.id,
        channel_id: Some(message.channel_id),
        message_id: Some(message.id),
        rule_name,
        trigger_content,
        original_content: Some(&message.content),
        actions_taken,
    };

    insert_automod_row(db, entry)
        .await
        .context("Unable to insert automod log record into database")
}
