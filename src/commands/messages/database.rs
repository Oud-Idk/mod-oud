use chrono::{DateTime, Utc};
use serenity::all::{Message, User};
use sqlx::{Error, PgPool};

pub struct Id {
    pub(crate) id: i32,
}

pub struct PartialDeletedMessage {
    pub(crate) content: String,
    pub(crate) deleted_at: Option<DateTime<Utc>>,
    pub(crate) channel_id: i64,
    pub(crate) attachment_url: Option<String>,
}

pub struct PartialEditedMessage {
    pub(crate) old_content: Option<String>,
    pub(crate) new_content: Option<String>,
    pub(crate) edited_at: Option<DateTime<Utc>>,
    pub(crate) channel_id: i64,
}

pub async fn insert_reported_message(
    db: &PgPool,
    guild_id: &str,
    channel_id: &str,
    attachment_url: &str,
    reason: &str,
    reporter_name: &str,

    message: &Message,
    reporter: &User,
) -> Result<Option<Id>, Error> {
    let message_id = &message.id.to_string();
    let author = &message.author;
    let message_content = &message.content;
    let author_id = &author.id.to_string();
    let author_name = &author.name;
    let reporter_id = &reporter.id.to_string();

    sqlx::query_as!(
        Id,
        r#"
        INSERT INTO reported_messages (guild_id, channel_id, message_id, author_id, reporter_id, message_content, attachment_url, reason, author_name, reporter_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (message_id, reporter_id) DO NOTHING
        RETURNING id
        "#,
        guild_id,
        channel_id,
        message_id,
        author_id,
        reporter_id,
        message_content,
        attachment_url,
        reason,
        author_name,
        reporter_name,
    )
        .fetch_optional(db)
        .await
}

pub async fn fetch_deleted_messages(db: &PgPool, target_uid: &i64, limit: i64) -> Result<Vec<PartialDeletedMessage>, Error> {
    sqlx::query_as!(
        PartialDeletedMessage,
        r#"
        SELECT content, deleted_at, channel_id, attachment_url FROM deleted_messages
        WHERE author_id = $1 ORDER BY deleted_at DESC LIMIT $2
        "#,
        target_uid,
        limit,
    )
        .fetch_all(db)
        .await
}

pub async fn fetch_modified_messages(db: &PgPool, target_uid: &i64, limit: i64) -> Result<Vec<PartialEditedMessage>, Error> {
    sqlx::query_as!(
        PartialEditedMessage,
        r#"
        SELECT old_content, new_content, edited_at, channel_id
        FROM modified_messages
        WHERE author_id = $1 ORDER BY edited_at DESC LIMIT $2
        "#,
        target_uid,
        limit,
    )
        .fetch_all(db)
        .await
}