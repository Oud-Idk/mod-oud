use anyhow::{Context, Result};
use serenity::all::Message;

/// Logs an automod action execution event to the database.
pub async fn insert_automod_row<'a>(
    db: &sqlx::PgPool,
    guild_id: u64,
    user_id: u64,
    channel_id: Option<u64>,
    message_id: Option<u64>,
    rule_name: &str,
    trigger_content: Option<&str>,
    original_content: Option<&str>,
    actions_taken: &[&'a str],
) -> Result<()> {
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
        channel_id.map(|c| c.cast_signed()),
        message_id.map(|m| m.cast_signed()),
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

    insert_automod_row(
        db,
        guild_id,
        user_id,
        Some(channel_id),
        Some(message_id),
        rule_name,
        trigger_content,
        Some(&message.content),
        actions_taken,
    )
    .await
    .context("Unable to insert automod log record into database")
}
