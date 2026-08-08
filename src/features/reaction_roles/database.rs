use crate::features::reaction_roles::types::ButtonStyle;
use crate::core::config::state::WebState;
use crate::features::reaction_roles::types::{ButtonRole, InteractionMode, ReactionMessage, ReactionRole};
use crate::{Data, Error};
use axum::http::StatusCode;
use fred::interfaces::KeysInterface;
use fred::types::Expiration;
use serenity::all::RoleId;
use sqlx::PgPool;
use sqlx::postgres::PgQueryResult;
use std::sync::Arc;
use fred::bytes_utils::Str;
use sqlx::types::Json;
use tracing::{error, trace, warn};
use crate::core::config::settings::MessageLayout;
use crate::shared::embed::Format;

/// Retrieves the Role ID associated with a message and emoji, utilizing Redis caching.
pub async fn get_reaction_role(
    data: &Data,
    message_id: i64,
    emoji: &str,
) -> Result<Option<RoleId>, Error> {
    let cache_key = format!("reaction_role:{}:{}", message_id, emoji);

    match data.redis.get::<Option<String>, _>(&cache_key).await {
        Ok(Some(cached_val)) => {
            if cached_val == "none" {
                return Ok(None);
            }
            if let Ok(role_id_u64) = cached_val.parse::<u64>() {
                return Ok(Some(RoleId::new(role_id_u64)));
            } else {
                error!("Invalid role ID format in Redis cache: {}", cached_val);
            }
        }
        Ok(None) => trace!("Cache miss when finding reaction role. Querying from database."),
        Err(e) => warn!("Redis read error (falling back to database): {}", e),
    }

    let row = sqlx::query!(
        r#"
        SELECT rr.role_id
        FROM reaction_roles rr
        JOIN reaction_messages rm ON rr.reaction_message_id = rm.id
        WHERE rm.message_id = $1 AND rr.emoji = $2
        "#,
        message_id,
        emoji
    )
        .fetch_optional(&data.db)
        .await?;

    if let Some(record) = row {
        let role_id_u64 = record.role_id as u64;
        if let Err(e) = data.redis.set::<(), _, _>(&cache_key, role_id_u64, None, None, false).await {
            warn!("Failed to write reaction role to Redis: {}", e);
        }
        Ok(Some(RoleId::new(role_id_u64)))
    } else {
        let expiration = Expiration::EX(300);
        if let Err(e) = data.redis.set::<(), _, _>(&cache_key, "none", Some(expiration), None, false).await {
            warn!("Failed to write negative cache result to Redis: {}", e);
        }
        Ok(None)
    }
}

pub async fn fetch_reaction_message(
    pool: &PgPool,
    config_id: i64,
    guild_id: &str,
) -> Result<ReactionMessage, (StatusCode, String)> {
    let guild_id: i64 = guild_id.parse().map_err(|e| {
        warn!(error = ?e, guild_id, "Invalid guild_id format");
        (StatusCode::BAD_REQUEST, "Invalid guild ID".to_string())
    })?;


    sqlx::query_as!(
        ReactionMessage,
        r#"
        SELECT id, message_id, name, channel_id, guild_id, mode as "mode: InteractionMode", message as "message: Json<MessageLayout>"
        FROM reaction_messages
        WHERE id = $1 AND guild_id = $2
        "#,
        config_id,
        guild_id,
    )
        .fetch_optional(pool)
        .await
        .inspect_err(|e| warn!(error = ?e, "Failed to load reaction roles database record"))
        .map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, "Database lookup error".to_string())
        })?
        .ok_or_else(|| {
            warn!(id = config_id, "Reaction message not found.");
            (StatusCode::NOT_FOUND, "Reaction configuration not found".to_string())
        })
}

/// Fetches associated reaction roles configuration from the database
pub async fn fetch_active_reactions(
    pool: &PgPool,
    reaction_message_id: i64,
) -> Result<Vec<ReactionRole>, (StatusCode, String)> {
    sqlx::query_as!(
        ReactionRole,
        r#"
        SELECT id, reaction_message_id, emoji, role_id
        FROM reaction_roles
        WHERE reaction_message_id = $1
        "#,
        reaction_message_id
    )
        .fetch_all(pool).await
        .inspect_err(|e| warn!(error = ?e, "Failed fetching reaction list"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, "Database lookup failed".to_string()))
}

pub async fn fetch_buttons(pool: &PgPool, reaction_message_id: i64) -> Result<Vec<ButtonRole>, (StatusCode, String)> {
    sqlx::query_as!(
        ButtonRole,
        r#"
        SELECT id, reaction_message_id, role_id, custom_id, label, style as "style: ButtonStyle", emoji
        FROM button_roles
        WHERE reaction_message_id = $1
        "#,
        reaction_message_id,
    )
        .fetch_all(pool).await
        .inspect_err(|e| warn!(error = ?e, "Failed to fetch button details"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, "Database lookup failed".to_string()))
}

pub async fn delete_message_from_db(state: &Arc<WebState>, config_id: i64) -> Result<(), (StatusCode, String)> {
    sqlx::query!(
        "UPDATE reaction_messages SET message_id = NULL WHERE id = $1",
        config_id
    )
        .execute(&state.db).await
        .inspect_err(|e| warn!(error = ?e, "Failed to clear message ID in database"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, "Database cleanup error".to_string()))?;
    Ok(())
}

pub async fn add_message_to_db(state: &Arc<WebState>, config_row: ReactionMessage, message_id: i64) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        "UPDATE reaction_messages SET message_id = $1 WHERE id = $2",
        message_id,
        config_row.id
    )
        .execute(&state.db)
        .await
}

pub async fn get_button_role(
    data: &Data,
    custom_id: &str,
) -> Result<Option<RoleId>, Error> {
    let cache_key = format!("button_role:{}", custom_id);

    match data.redis.get::<Option<String>, _>(&cache_key).await {
        Ok(Some(cached_val)) => {
            if cached_val == "none" {
                return Ok(None);
            }
            if let Ok(role_id_u64) = cached_val.parse::<u64>() {
                return Ok(Some(RoleId::new(role_id_u64)));
            } else {
                error!("Invalid role ID format in Redis cache: {}", cached_val);
            }
        }
        Ok(None) => trace!("Cache miss when finding button role. Querying from database."),
        Err(e) => warn!("Redis read error (falling back to database): {}", e),
    }

    let row = sqlx::query!(
        r#"
        SELECT role_id
        FROM button_roles
        WHERE custom_id = $1
        "#,
        custom_id
    )
        .fetch_optional(&data.db)
        .await?;

    if let Some(record) = row {
        let role_id_u64 = record.role_id as u64;
        if let Err(e) = data.redis.set::<(), _, _>(&cache_key, role_id_u64, None, None, false).await {
            warn!("Failed to write button role to Redis: {}", e);
        }
        Ok(Some(RoleId::new(role_id_u64)))
    } else {
        let expiration = Expiration::EX(300);
        if let Err(e) = data.redis.set::<(), _, _>(&cache_key, "none", Some(expiration), None, false).await {
            warn!("Failed to write negative cache result to Redis: {}", e);
        }
        Ok(None)
    }
}