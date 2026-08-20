use crate::features::starboard::types::SimpleStarboard;
use anyhow::Result;
use serenity::all::{ChannelId, Context, GuildId, MessageId, UserId};
use sqlx::PgPool;

/// Helper to fetch the existing starboard message ID from the database
pub async fn fetch_starboard_message_id(
    db: &PgPool,
    orig_msg_id: MessageId,
    starboard_id: i64,
) -> Result<Option<MessageId>> {
    let existing_post_id = sqlx::query_scalar!(
        "SELECT starboard_message_id FROM starred_messages WHERE original_message_id = $1 AND starboard_id = $2",
        orig_msg_id.get().cast_signed(),
        starboard_id
    )
        .fetch_optional(db)
        .await?
        .flatten();

    Ok(existing_post_id.map(i64::cast_unsigned).map(MessageId::new))
}

/// Helper to delete the message from Discord and remove its entry from the database
pub async fn handle_starboard_demotion(
    ctx: &Context,
    db: &PgPool,
    starboard_channel: ChannelId,
    starboard_msg_id: MessageId,
    orig_msg_id: MessageId,
    starboard_id: i64,
) -> Result<()> {
    let _ = starboard_channel
        .delete_message(&ctx.http, starboard_msg_id)
        .await;

    sqlx::query!(
        "DELETE FROM starred_messages WHERE original_message_id = $1 AND starboard_id = $2",
        orig_msg_id.get().cast_signed(),
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
) -> Result<()> {
    sqlx::query!(
        "UPDATE starred_messages SET star_count = $1 WHERE original_message_id = $2 AND starboard_id = $3",
        i32::try_from(emoji_count).unwrap_or(i32::MAX),
        orig_msg_id.get().cast_signed(),
        starboard_id
    )
        .execute(db)
        .await?;

    Ok(())
}

pub struct StarboardPayload {
    pub orig_msg_id: MessageId,
    pub starboard_msg_id: MessageId,
    pub starboard_id: i64,
    pub guild_id: GuildId,
    pub channel_id: ChannelId,
    pub author_id: UserId,
    pub emoji_count: u64,
}

/// Inserts a new record for a starred message
pub async fn insert_starred_message(
    db: &PgPool,
    starboard_payload: StarboardPayload,
) -> Result<()> {
    let StarboardPayload {
        orig_msg_id,
        starboard_msg_id,
        starboard_id,
        guild_id,
        channel_id,
        author_id,
        emoji_count,
    } = starboard_payload;

    sqlx::query!(
        r#"
        INSERT INTO starred_messages (
            original_message_id, starboard_message_id, starboard_id,
            guild_id, channel_id, author_id, star_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
        orig_msg_id.get().cast_signed(),
        starboard_msg_id.get().cast_signed(),
        starboard_id,
        guild_id.get().cast_signed(),
        channel_id.get().cast_signed(),
        author_id.get().cast_signed(),
        i32::try_from(emoji_count)?,
    )
    .execute(db)
    .await?;

    Ok(())
}

pub async fn delete_starboard(db: &PgPool, id: MessageId) -> Result<()> {
    sqlx::query!(
        r#"
        DELETE FROM starred_messages
        WHERE original_message_id = $1
        "#,
        id.get().cast_signed()
    )
    .execute(db)
    .await?;
    Ok(())
}

#[derive(sqlx::FromRow)]
struct SimpleStarboardRow {
    pub starboard_message_id: Option<i64>,
    pub starboard_channel_id: i64,
    pub keep_deleted_messages: Option<bool>,
}

impl From<SimpleStarboardRow> for SimpleStarboard {
    fn from(row: SimpleStarboardRow) -> Self {
        Self {
            keep_deleted_messages: row.keep_deleted_messages,
            starboard_message_id: row
                .starboard_message_id
                .map(|id| MessageId::new(id.cast_unsigned())),
            starboard_channel_id: ChannelId::new(row.starboard_channel_id.cast_unsigned()),
        }
    }
}

pub async fn fetch_starboard(db: &PgPool, id: MessageId) -> Result<Vec<SimpleStarboard>> {
    let rows = sqlx::query_as!(
        SimpleStarboardRow,
        r#"
        SELECT sm.starboard_message_id, s.starboard_channel_id, s.keep_deleted_messages
        FROM starred_messages sm
        JOIN starboards s ON sm.starboard_id = s.id
        WHERE sm.original_message_id = $1
        "#,
        id.get().cast_signed()
    )
    .fetch_all(db)
    .await?;

    let starboards = rows.into_iter().map(Into::into).collect();

    Ok(starboards)
}
