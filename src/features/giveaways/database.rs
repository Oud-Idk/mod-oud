use crate::core::config::message_layout::MessageLayout;
use crate::features::giveaways::types::Giveaway;
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serenity::model::id::ChannelId;
use serenity::model::id::GuildId;
use serenity::model::id::MessageId;
use serenity::model::id::UserId;
use sqlx::PgPool;
use sqlx::postgres::PgQueryResult;
use sqlx::types::Json;
use tracing::{error, warn};

/// Fetches a single giveaway configuration by ID and Guild ID for the web handler
pub async fn fetch_giveaway(
    pool: &PgPool,
    config_id: i64,
    guild_id: u64,
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
        guild_id.cast_signed(),
    )
    .fetch_optional(pool)
    .await
    .inspect_err(|e| warn!(error = ?e, "giveaway database record lookup failed"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error".to_string(),
        )
    })?
    .ok_or_else(|| {
        warn!(config_id, "giveaway configuration not found");
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
    message_id: MessageId,
) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        "UPDATE giveaways SET message_id = $1 WHERE id = $2",
        message_id.get().cast_signed(),
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
    .inspect_err(|e| error!(error = ?e, "giveaway message id not cleared in the database"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error".to_string(),
        )
    })?;
    Ok(())
}

/// Used by the background task scheduler to fetch all active giveaways that have reached their end time.
///
/// The layout is read as raw JSON and decoded per row by the caller. Decoding here would let one
/// malformed record fail the whole sweep, so every guild's giveaways would stop ending.
pub async fn fetch_expired_giveaways(
    pool: &PgPool,
) -> Result<Vec<RawExpiredGiveaway>, sqlx::Error> {
    sqlx::query_as!(
        RawExpiredGiveaway,
        r#"
        SELECT id, guild_id, host_id, channel_id, message_id, prize, winner_count,
               end_time, is_finished,
               message_layout AS "message_layout: Json<serde_json::Value>"
        FROM giveaways
        WHERE end_time <= NOW() AND is_finished = FALSE AND message_id IS NOT NULL
        "#
    )
    .fetch_all(pool)
    .await
}

/// A giveaway whose message layout has not been decoded yet.
#[derive(Debug, sqlx::FromRow)]
pub struct RawExpiredGiveaway {
    pub id: i64,
    pub guild_id: i64,
    pub host_id: i64,
    pub channel_id: Option<i64>,
    pub message_id: Option<i64>,
    pub prize: String,
    pub winner_count: i32,
    pub end_time: DateTime<Utc>,
    pub is_finished: bool,
    pub message_layout: Json<serde_json::Value>,
}

impl RawExpiredGiveaway {
    /// Decodes the stored layout, returning `None` when the row cannot be rendered.
    #[must_use]
    pub fn giveaway(&self) -> Option<Giveaway> {
        let message = serde_json::from_value(self.message_layout.0.clone()).ok()?;
        Some(Giveaway {
            id: self.id,
            guild_id: self.guild_id,
            host_id: self.host_id,
            channel_id: self.channel_id,
            message_id: self.message_id,
            prize: self.prize.clone(),
            winner_count: self.winner_count,
            end_time: self.end_time,
            is_finished: self.is_finished,
            message: Json(message),
        })
    }
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
#[allow(dead_code)] // For reasons I don't understand, Rust considers this function dead code
pub async fn create_giveaway(
    pool: &PgPool,
    guild_id: GuildId,
    host_id: UserId,
    channel_id: ChannelId,
    prize: &str,
    winner_count: i32,
    end_time: DateTime<Utc>,
) -> Result<i64, sqlx::Error> {
    let rec = sqlx::query!(
        r#"
        INSERT INTO giveaways (guild_id, host_id, channel_id, prize, winner_count, end_time, is_finished, message_layout)
        VALUES ($1, $2, $3, $4, $5, $6, FALSE, '{"format": "TEXT", "content": "🎉 **GIVEAWAY** 🎉\nPrize: **{prize}**\nClick the button below to enter!", "embed": {}}'::jsonb)
        RETURNING id
        "#,
        guild_id.get().cast_signed(),
        host_id.get().cast_signed(),
        channel_id.get().cast_signed(),
        prize,
        winner_count,
        end_time
    )
        .fetch_one(pool)
        .await?;

    Ok(rec.id)
}
