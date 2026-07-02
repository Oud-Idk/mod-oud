use crate::web::routes::reaction_role::types::{ButtonRole, ReactionMessage, ReactionRole};
use crate::WebState;
use axum::http::StatusCode;
use sqlx::postgres::PgQueryResult;
use sqlx::{Error, PgPool};
use std::sync::Arc;
use tracing::warn;

pub async fn fetch_reaction_message(
    pool: &PgPool,
    config_id: i32,
    guild_id: &str,
) -> Result<ReactionMessage, (StatusCode, String)> {
    sqlx::query_as::<_, ReactionMessage>(
        "SELECT id, message_id, name, channel_id, guild_id, mode, format, embed, content
         FROM reaction_messages
         WHERE id = $1 AND guild_id = $2"
    )
        .bind(config_id)
        .bind(guild_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            warn!(error = ?e, "Failed to load reaction roles database record");
            (StatusCode::INTERNAL_SERVER_ERROR, "Database lookup error".to_string())
        })?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Reaction configuration not found".to_string()))
}

/// Fetches associated reaction roles configuration from the database
pub async fn fetch_active_reactions(
    pool: &PgPool,
    reaction_message_id: i32,
) -> Result<Vec<ReactionRole>, (StatusCode, String)> {
    sqlx::query_as::<_, ReactionRole>(
        "SELECT id, reaction_message_id, emoji, role_id
         FROM reaction_roles
         WHERE reaction_message_id = $1"
    )
        .bind(reaction_message_id)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            warn!(error = ?e, "Failed fetching reaction list");
            (StatusCode::INTERNAL_SERVER_ERROR, "Database lookup failed".to_string())
        })
}

pub async fn fetch_buttons(pool: &PgPool, reaction_message_id: i32) -> Result<Vec<ButtonRole>, (StatusCode, String)> {
    sqlx::query_as::<_, ButtonRole>(
        "SELECT id, reaction_message_id, role_id, custom_id, label, style, emoji
         FROM button_roles
         WHERE reaction_message_id = $1"
    )
        .bind(reaction_message_id)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            warn!(error = ?e, "Failed to fetch button details");
            (StatusCode::INTERNAL_SERVER_ERROR, "Database lookup failed".to_string())
        })
}

pub async fn delete_message_from_db(state: &Arc<WebState>, config_id: i32) -> Result<(), (StatusCode, String)> {
    sqlx::query!(
        "UPDATE reaction_messages SET message_id = NULL WHERE id = $1",
        config_id
    )
        .execute(&state.pool)
        .await
        .map_err(|e| {
            warn!(error = ?e, "Failed to clear message ID in database");
            (StatusCode::INTERNAL_SERVER_ERROR, "Database cleanup error".to_string())
        })?;
    Ok(())
}

pub async fn add_message_to_db(state: &Arc<WebState>, config_row: ReactionMessage, message_id_str: &String) -> Result<PgQueryResult, Error> {
    sqlx::query!(
        "UPDATE reaction_messages SET message_id = $1 WHERE id = $2",
        message_id_str,
        config_row.id
    )
        .execute(&state.pool)
        .await
}