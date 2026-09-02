use crate::features::economy::types::WorkMessage;
use serenity::all::GuildId;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(sqlx::FromRow)]
struct RawWorkMessage {
    id: Uuid,
    guild_id: i64,
    content: String,
}

impl From<RawWorkMessage> for WorkMessage {
    fn from(r: RawWorkMessage) -> Self {
        Self {
            id: r.id,
            guild_id: GuildId::new(r.guild_id.cast_unsigned()),
            content: r.content,
        }
    }
}

pub async fn list_work_messages(
    db: &PgPool,
    guild_id: GuildId,
) -> Result<Vec<WorkMessage>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawWorkMessage,
        r#"
        SELECT id, guild_id, content
        FROM economy_work_messages
        WHERE guild_id = $1
        ORDER BY created_at ASC
        "#,
        guild_id.get().cast_signed(),
    )
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn get_random_work_message(
    db: &PgPool,
    guild_id: GuildId,
) -> Result<Option<WorkMessage>, sqlx::Error> {
    let row = sqlx::query_as!(
        RawWorkMessage,
        r#"
        SELECT id, guild_id, content
        FROM economy_work_messages
        WHERE guild_id = $1
        ORDER BY RANDOM()
        LIMIT 1
        "#,
        guild_id.get().cast_signed(),
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(Into::into))
}

pub async fn create_work_message(
    db: &PgPool,
    guild_id: GuildId,
    content: &str,
) -> Result<WorkMessage, sqlx::Error> {
    let row = sqlx::query_as!(
        RawWorkMessage,
        r#"
        INSERT INTO economy_work_messages (guild_id, content)
        VALUES ($1, $2)
        RETURNING id, guild_id, content
        "#,
        guild_id.get().cast_signed(),
        content,
    )
    .fetch_one(db)
    .await?;

    Ok(row.into())
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
    let row = sqlx::query_as!(
        RawWorkMessage,
        r#"
        UPDATE economy_work_messages
        SET content = $3
        WHERE guild_id = $1 AND id = $2
        RETURNING id, guild_id, content
        "#,
        guild_id.get().cast_signed(),
        message_id,
        content,
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(Into::into))
}
