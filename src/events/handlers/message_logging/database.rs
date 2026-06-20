use crate::events::handlers::message_logging::types::{EditDetails, MessageDetails};
use sqlx::postgres::PgQueryResult;
use sqlx::PgPool;

pub async fn insert_deleted_message(db: &PgPool, msg: &MessageDetails, g_id: i64, joined_image_urls: &str, deleted_by: &Option<(String, String)>) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO deleted_messages (message_id, author_id, author_name, channel_id, guild_id, content, attachment_url, deleted_by_name, deleted_by_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
        msg.msg_id,
        msg.author_id,
        msg.author_name,
        msg.chan_id,
        g_id,
        msg.content,
        joined_image_urls,
        deleted_by.clone().map(|id| id.0),
        deleted_by.clone().map(|id| id.1),
    )
        .execute(db)
        .await
}

pub async fn insert_modified_messages(db: &PgPool, edit_details: &EditDetails, g_id: i64) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO modified_messages (message_id, author_id, author_name, channel_id, guild_id, old_content, new_content)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
        edit_details.msg_id,
        edit_details.author_id,
        edit_details.author_name,
        edit_details.chan_id,
        g_id,
        edit_details.old_content.as_deref(),
        edit_details.new_content.as_deref(),
    )
        .execute(db)
        .await
}