use crate::features::economy::types::WorkMessage;
use serenity::all::GuildId;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn list_work_messages(db: &PgPool, guild_id: GuildId) -> Result<Vec<WorkMessage>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT id, guild_id, content, created_at
        FROM economy_work_messages
        WHERE guild_id = $1
        ORDER BY created_at ASC
        "#,
        guild_id.get().cast_signed(),
    )
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| WorkMessage {
            id: r.id,
            guild_id: GuildId::new(r.guild_id.cast_unsigned()),
            content: r.content,
            created_at: r.created_at,
        })
        .collect())
}

pub async fn get_random_work_message(
    db: &PgPool,
    guild_id: GuildId,
) -> Result<Option<WorkMessage>, sqlx::Error> {
    let row = sqlx::query!(
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
    .await?;

    Ok(row.map(|r| WorkMessage {
        id: r.id,
        guild_id: GuildId::new(r.guild_id.cast_unsigned()),
        content: r.content,
        created_at: r.created_at,
    }))
}

pub async fn create_work_message(
    db: &PgPool,
    guild_id: GuildId,
    content: &str,
) -> Result<WorkMessage, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        INSERT INTO economy_work_messages (guild_id, content)
        VALUES ($1, $2)
        RETURNING id, guild_id, content, created_at
        "#,
        guild_id.get().cast_signed(),
        content,
    )
    .fetch_one(db)
    .await?;

    Ok(WorkMessage {
        id: row.id,
        guild_id: GuildId::new(row.guild_id.cast_unsigned()),
        content: row.content,
        created_at: row.created_at,
    })
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
    let row = sqlx::query!(
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
    .await?;

    Ok(row.map(|r| WorkMessage {
        id: r.id,
        guild_id: GuildId::new(r.guild_id.cast_unsigned()),
        content: r.content,
        created_at: r.created_at,
    }))
}
