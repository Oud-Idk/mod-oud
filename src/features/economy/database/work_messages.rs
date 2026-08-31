use crate::features::economy::types::WorkMessage;
use serenity::all::GuildId;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn list_work_messages(db: &PgPool, guild_id: GuildId) -> Result<Vec<WorkMessage>, sqlx::Error> {
    sqlx::query_as!(
        WorkMessage,
        r#"
        SELECT id, guild_id, content, created_at
        FROM economy_work_messages
        WHERE guild_id = $1
        ORDER BY created_at ASC
        "#,
        guild_id.get().cast_signed(),
    )
    .fetch_all(db)
    .await
}

pub async fn get_random_work_message(
    db: &PgPool,
    guild_id: GuildId,
) -> Result<Option<WorkMessage>, sqlx::Error> {
    sqlx::query_as!(
        WorkMessage,
        r#"
        SELECT id, guild_id, content, created_at
        FROM economy_work_messages
        WHERE guild_id = $1
        ORDER BY RANDOM()
        LIMIT 1
        "#,
        guild_id.get().cast_signed(),
    )
    .fetch_optional(db)
    .await
}

pub async fn create_work_message(
    db: &PgPool,
    guild_id: GuildId,
    content: &str,
) -> Result<WorkMessage, sqlx::Error> {
    sqlx::query_as!(
        WorkMessage,
        r#"
        INSERT INTO economy_work_messages (guild_id, content)
        VALUES ($1, $2)
        RETURNING id, guild_id, content, created_at
        "#,
        guild_id.get().cast_signed(),
        content,
    )
    .fetch_one(db)
    .await
}

pub async fn delete_work_message(
    db: &PgPool,
    guild_id: GuildId,
    message_id: Uuid,
) -> Result<u64, sqlx::Error> {
    let r = sqlx::query!(
        r#"
        DELETE FROM economy_work_messages
        WHERE guild_id = $1 AND id = $2
        "#,
        guild_id.get().cast_signed(),
        message_id,
    )
    .execute(db)
    .await?;
    Ok(r.rows_affected())
}

pub async fn update_work_message(
    db: &PgPool,
    guild_id: GuildId,
    message_id: Uuid,
    content: &str,
) -> Result<Option<WorkMessage>, sqlx::Error> {
    sqlx::query_as!(
        WorkMessage,
        r#"
        UPDATE economy_work_messages
        SET content = $3
        WHERE guild_id = $1 AND id = $2
        RETURNING id, guild_id, content, created_at
        "#,
        guild_id.get().cast_signed(),
        message_id,
        content,
    )
    .fetch_optional(db)
    .await
}
