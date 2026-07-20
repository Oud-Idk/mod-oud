use crate::types::config::config::Format;
use crate::web::routes::reaction_role::types::{ButtonRole, ButtonStyle, InteractionMode, ReactionMessage, ReactionRole};
use crate::WebState;
use axum::http::StatusCode;
use sqlx::postgres::PgQueryResult;
use sqlx::{Error, PgPool};
use std::sync::Arc;
use tracing::warn;

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
        SELECT id, message_id, name, channel_id, guild_id, mode as "mode: InteractionMode",
               format as "format: Format", embed, content
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

pub async fn add_message_to_db(state: &Arc<WebState>, config_row: ReactionMessage, message_id: i64) -> Result<PgQueryResult, Error> {
    sqlx::query!(
        "UPDATE reaction_messages SET message_id = $1 WHERE id = $2",
        message_id,
        config_row.id
    )
        .execute(&state.db)
        .await
}