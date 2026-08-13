use crate::core::config::message_layout::MessageLayout;
use crate::features::giveaways::types::Giveaway;
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use sqlx::postgres::PgQueryResult;
use sqlx::types::Json;
use tracing::warn;

/// Fetches a single giveaway configuration by ID and Guild ID for the web handler
pub async fn fetch_giveaway(
    pool: &PgPool,
    config_id: i64,
    guild_id: i64,
) -> Result<Giveaway, (StatusCode, String)> {
    sqlx::query_as!(
        Giveaway,
        r#"
        SELECT id, guild_id, host_id, channel_id, message_id, prize, winner_count,
               end_time, is_finished,
               message_layout AS "message!: Json<MessageLayout>"
        FROM giveaways
        WHERE id = $1 AND guild_id = $2
        "#,
        config_id,
        guild_id,
    )
        .fetch_optional(pool)
        .await
        .inspect_err(|e| warn!(error = ?e, "Failed to load giveaway database record"))
        .map_err(|_| {
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string(),)
        })?
        .ok_or_else(|| {
            warn!(id = config_id, "Giveaway configuration not found.");
            (StatusCode::NOT_FOUND, "Giveaway configuration not found".to_string(),)
        })
}

/// Updates the Discord message ID associated with a giveaway after dispatching
pub async fn update_giveaway_message_id(
    pool: &PgPool,
    config_id: i64,
    message_id: i64,
) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        "UPDATE giveaways SET message_id = $1 WHERE id = $2",
        message_id,
        config_id
    )
        .execute(pool)
        .await
}

/// Clears the message ID when deleting or unlinking a giveaway message from Discord
pub async fn clear_giveaway_message_id(
    pool: &PgPool,
    config_id: i64,
) -> Result<(), (StatusCode, String)> {
    sqlx::query!(
        "UPDATE giveaways SET message_id = NULL WHERE id = $1",
        config_id
    )
        .execute(pool)
        .await
        .inspect_err(|e| warn!(error = ?e, "Failed to clear giveaway message ID in database"))
        .map_err(|_| { (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string(),) })?;
    Ok(())
}

/// Used by the background task scheduler to fetch all active giveaways that have reached their end time
pub async fn fetch_expired_giveaways(pool: &PgPool) -> Result<Vec<Giveaway>, sqlx::Error> {
    sqlx::query_as!(
        Giveaway,
        r#"
        SELECT id, guild_id, host_id, channel_id, message_id, prize, winner_count,
               end_time, is_finished,
               message_layout AS "message!: Json<MessageLayout>"
        FROM giveaways
        WHERE end_time <= NOW() AND is_finished = FALSE AND message_id IS NOT NULL
        "#
    )
        .fetch_all(pool)
        .await
}

/// Marks a giveaway as finished in the DB after picking winners
pub async fn mark_giveaway_finished(pool: &PgPool, giveaway_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE giveaways SET is_finished = TRUE WHERE id = $1",
        giveaway_id
    )
        .execute(pool)
        .await?;
    Ok(())
}

/// Inserts a new giveaway record into the database with default `message_layout` JSONB
pub async fn create_giveaway(
    pool: &PgPool,
    guild_id: i64,
    host_id: i64,
    channel_id: i64,
    prize: &str,
    winner_count: i32,
    end_time: DateTime<Utc>,
) -> Result<i64, sqlx::Error> {
    let rec = sqlx::query!(
        r#"
        INSERT INTO giveaways (guild_id, host_id, channel_id, prize, winner_count, end_time, is_finished, message_layout)
        VALUES ($1, $2, $3, $4, $5, $6, FALSE, '{"enabled": true, "format": "TEXT", "content": "", "embed": {}}'::jsonb)
        RETURNING id
        "#,
        guild_id,
        host_id,
        channel_id,
        prize,
        winner_count,
        end_time
    )
        .fetch_one(pool)
        .await?;

    Ok(rec.id)
}