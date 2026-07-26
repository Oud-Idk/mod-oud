use crate::core::config::state::WebState;
use crate::features::giveaways::types::Giveaway;
use crate::shared::embed::{Format, DiscordEmbed};
use crate::{Data, Error};
use axum::http::StatusCode;
use fred::interfaces::KeysInterface;
use fred::types::Expiration;
use sqlx::postgres::PgQueryResult;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{error, trace, warn};

/// Fetches a single giveaway configuration by ID and Guild ID for the web handler
pub async fn fetch_giveaway(
    pool: &PgPool,
    config_id: i64,
    guild_id: i64,
) -> Result<Giveaway, (StatusCode, String)> {
    sqlx::query_as!(
        Giveaway,
        r#"
        SELECT id, guild_id, channel_id, message_id, prize, winner_count, host_id,
               end_time, is_finished, format as "format: Format", embed as "embed?: sqlx::types::Json<DiscordEmbed>", content
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
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Database lookup error".to_string(),
            )
        })?
        .ok_or_else(|| {
            warn!(id = config_id, "Giveaway configuration not found.");
            (
                StatusCode::NOT_FOUND,
                "Giveaway configuration not found".to_string(),
            )
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
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Database cleanup error".to_string(),
            )
        })?;
    Ok(())
}

/// Fetches giveaway details by Discord Message ID with Redis caching
pub async fn get_giveaway_by_message_id(
    data: &Data,
    message_id: i64,
) -> Result<Option<Giveaway>, Error> {
    let cache_key = format!("giveaway:msg:{}", message_id);

    match data.redis.get::<Option<String>, _>(&cache_key).await {
        Ok(Some(cached_json)) => {
            if cached_json == "none" {
                return Ok(None);
            }
            if let Ok(giveaway) = serde_json::from_str::<Giveaway>(&cached_json) {
                return Ok(Some(giveaway));
            } else {
                error!("Failed to parse cached giveaway JSON: {}", cached_json);
            }
        }
        Ok(None) => trace!("Cache miss for giveaway. Querying from database."),
        Err(e) => warn!("Redis read error (falling back to database): {}", e),
    }

    let giveaway = sqlx::query_as!(
        Giveaway,
        r#"
        SELECT id, guild_id, channel_id, message_id, prize, winner_count, host_id,
               end_time, is_finished, format as "format: Format", embed as "embed?: sqlx::types::Json<DiscordEmbed>", content
        FROM giveaways
        WHERE message_id = $1
        "#,
        message_id
    )
        .fetch_optional(&data.db)
        .await?;

    if let Some(ref record) = giveaway {
        if let Ok(json_str) = serde_json::to_string(record) {
            let expiration = Expiration::EX(300); // 5 min cache
            if let Err(e) = data
                .redis
                .set::<(), _, _>(&cache_key, json_str, Some(expiration), None, false)
                .await
            {
                warn!("Failed to write giveaway to Redis: {}", e);
            }
        }
    } else {
        let expiration = Expiration::EX(120); // 2 min negative cache
        if let Err(e) = data
            .redis
            .set::<(), _, _>(&cache_key, "none", Some(expiration), None, false)
            .await
        {
            warn!("Failed to write negative cache result to Redis: {}", e);
        }
    }

    Ok(giveaway)
}

/// Used by the background task scheduler to fetch all active giveaways that have reached their end time
pub async fn fetch_expired_giveaways(pool: &PgPool) -> Result<Vec<Giveaway>, sqlx::Error> {
    sqlx::query_as!(
        Giveaway,
        r#"
        SELECT id, guild_id, channel_id, message_id, prize, winner_count,
               end_time, is_finished, format as "format: Format", host_id,
               embed as "embed?: sqlx::types::Json<DiscordEmbed>", content
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