use anyhow::{Context, Result};
use serenity::all::Message;

/// Represents a row of data for an Automod event log to be inserted into the database.
pub struct AutomodEntryRow<'a> {
    /// The ID of the Discord guild (server) where the event occurred.
    pub guild_id: u64,

    /// The ID of the user who triggered the Automod rule.
    pub user_id: u64,

    /// The ID of the Discord channel where the trigger occurred, if applicable.
    pub channel_id: Option<u64>,

    /// The ID of the message that triggered the rule, if the event was message-based.
    pub message_id: Option<u64>,

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
/// Returns `Err` when DB fails to execute the query.
pub async fn insert_automod_row(db: &sqlx::PgPool, entry: AutomodEntryRow<'_>) -> Result<()> {
    let AutomodEntryRow {
        guild_id,
        user_id,
        channel_id,
        message_id,
        rule_name,
        trigger_content,
        original_content,
        actions_taken,
    } = entry;

    let actions_vec: Vec<String> = actions_taken
        .iter()
        .map(|&action| action.to_string())
        .collect();

    sqlx::query!(
        r#"
        INSERT INTO automod_logs (guild_id,
        user_id, channel_id, message_id, rule_type, trigger_content, original_content, actions_taken)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
        guild_id.cast_signed(),
        user_id.cast_signed(),
        channel_id.map(u64::cast_signed),
        message_id.map(u64::cast_signed),
        rule_name,
        trigger_content,
        original_content,
        &actions_vec,
    )
        .execute(db)
        .await?;

    Ok(())
}

pub async fn log_automod_event(
    db: &sqlx::PgPool,
    message: &Message,
    rule_name: &str,
    trigger_content: Option<&str>,
    actions_taken: &[&'static str],
) -> Result<()> {
    let guild_id = message.guild_id.unwrap_or_default().get();
    let user_id = message.author.id.get();
    let channel_id = message.channel_id.get();
    let message_id = message.id.get();

    let entry = AutomodEntryRow {
        guild_id,
        user_id,
        channel_id: Some(channel_id),
        message_id: Some(message_id),
        rule_name,
        trigger_content,
        original_content: Some(&message.content),
        actions_taken,
    };

    insert_automod_row(db, entry)
        .await
        .context("Unable to insert automod log record into database")
}
