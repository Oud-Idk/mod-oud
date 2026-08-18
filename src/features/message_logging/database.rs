use crate::features::message_logging::types::{EditDetails, MessageDetails};
use serenity::all::{GuildId, UserId};
use sqlx::PgPool;
use sqlx::postgres::PgQueryResult;

pub async fn insert_deleted_message(
    db: &PgPool,
    msg: &MessageDetails,
    guild_id: GuildId,
    joined_image_urls: &str,
    deleted_by: Option<&(UserId, String)>,
) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO deleted_messages (message_id, author_id, channel_id, guild_id, content, attachment_url, deleted_by_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
        msg.msg_id.get().cast_signed(),
        msg.author_id.get().cast_signed(),
        msg.chan_id.get().cast_signed(),
        guild_id.get().cast_signed(),
        msg.content,
        joined_image_urls,
        deleted_by.clone().map(|id| id.0.get().cast_signed()),
    )
        .execute(db)
        .await
}

pub async fn insert_modified_messages(
    db: &PgPool,
    edit_details: &EditDetails,
    guild_id: GuildId,
) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO modified_messages (message_id, author_id, channel_id, guild_id, old_content, new_content)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
        edit_details.msg_id.get().cast_signed(),
        edit_details.author_id.get().cast_signed(),
        edit_details.chan_id.get().cast_signed(),
        guild_id.get().cast_signed(),
        edit_details.old_content.as_deref(),
        edit_details.new_content.as_deref(),
    )
        .execute(db)
        .await
}
