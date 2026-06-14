use crate::types::types::Error;
use serenity::all::{ChannelId, Context, GuildId, MessageId, UserId};
use sqlx::PgPool;

/// Helper to fetch the existing starboard message ID from the database
pub async fn fetch_starboard_message_id(
    db: &PgPool,
    orig_msg_id: MessageId,
    starboard_id: i64,
) -> Result<Option<MessageId>, Error> {
    let existing_post_id = sqlx::query_scalar!(
        "SELECT starboard_message_id FROM starred_messages WHERE original_message_id = $1 AND starboard_id = $2",
        orig_msg_id.to_string(),
        starboard_id
    )
        .fetch_optional(db)
        .await?
        .flatten();

    Ok(existing_post_id
        .and_then(|id| id.parse::<u64>().ok())
        .map(MessageId::new))
}

/// Helper to delete the message from Discord and remove its entry from the database
pub async fn handle_starboard_demotion(
    ctx: &Context,
    db: &PgPool,
    starboard_channel: ChannelId,
    starboard_msg_id: MessageId,
    orig_msg_id: MessageId,
    starboard_id: i64,
) -> Result<(), Error> {
    let _ = starboard_channel.delete_message(&ctx.http, starboard_msg_id).await;

    sqlx::query!(
        "DELETE FROM starred_messages WHERE original_message_id = $1 AND starboard_id = $2",
        orig_msg_id.to_string(),
        starboard_id
    )
        .execute(db)
        .await?;

    Ok(())
}

pub async fn update_starred_message_count(
    db: &PgPool,
    orig_msg_id: MessageId,
    starboard_id: i64,
    emoji_count: u64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE starred_messages SET star_count = $1 WHERE original_message_id = $2 AND starboard_id = $3",
        emoji_count as i32,
        orig_msg_id.to_string(),
        starboard_id
    )
        .execute(db)
        .await?;

    Ok(())
}

/// Inserts a new record for a starred message
pub async fn insert_starred_message(
    db: &PgPool,
    orig_msg_id: MessageId,
    starboard_msg_id: MessageId,
    starboard_id: i64,
    guild_id: GuildId,
    channel_id: ChannelId,
    author_id: UserId,
    emoji_count: u64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO starred_messages (
            original_message_id, starboard_message_id, starboard_id,
            guild_id, channel_id, author_id, star_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
        orig_msg_id.to_string(),
        starboard_msg_id.to_string(),
        starboard_id,
        guild_id.to_string(),
        channel_id.to_string(),
        author_id.to_string(),
        emoji_count as i32
    )
        .execute(db)
        .await?;

    Ok(())
}