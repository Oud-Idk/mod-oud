use crate::core::config::message_layout::MessageLayout;
use crate::core::config::state::{BotData, Error, WebState};
use crate::features::reaction_roles::cache;
use crate::features::reaction_roles::types::ButtonStyle;
use crate::features::reaction_roles::types::{
    ButtonRole, InteractionMode, ReactionMessage, ReactionRole,
};
use axum::http::StatusCode;
use serenity::all::{ChannelId, GuildId, MessageId, RoleId};
use sqlx::PgPool;
use sqlx::postgres::PgQueryResult;
use sqlx::types::Json;
use std::sync::Arc;
use tracing::{error, warn};

#[derive(sqlx::FromRow)]
struct RawReactionMessage {
    id: i64,
    message_id: Option<i64>,
    channel_id: i64,
    mode: InteractionMode,
    message: Json<MessageLayout>,
}

impl From<RawReactionMessage> for ReactionMessage {
    fn from(r: RawReactionMessage) -> Self {
        Self {
            id: r.id,
            message_id: r.message_id.map(|id| MessageId::new(id.cast_unsigned())),
            channel_id: ChannelId::new(r.channel_id.cast_unsigned()),
            mode: r.mode,
            message: r.message,
        }
    }
}

/// Retrieves the Role ID associated with a message and emoji, utilizing Redis caching.
///
/// The lookup is scoped to `guild_id`: a message ID that resolves to another guild's panel
/// must not hand out a role in this one.
pub async fn get_reaction_role(
    data: &BotData,
    guild_id: GuildId,
    message_id: MessageId,
    emoji: &str,
) -> Result<Option<RoleId>, Error> {
    let cache_key = cache::reaction_role_key(guild_id.get(), message_id, emoji);

    if let Some(cached) = cache::get_cached_role(&data.core.redis, &cache_key).await {
        return Ok(cached);
    }

    let row = sqlx::query!(
        r#"
        SELECT rr.role_id
        FROM reaction_roles rr
        JOIN reaction_messages rm ON rr.reaction_message_id = rm.id
        WHERE rm.message_id = $1 AND rr.emoji = $2 AND rm.guild_id = $3
        "#,
        message_id.get().cast_signed(),
        emoji,
        guild_id.get().cast_signed(),
    )
    .fetch_optional(&data.core.db)
    .await?;

    if let Some(record) = row {
        let role_id = RoleId::new(record.role_id.cast_unsigned());
        cache::cache_role(&data.core.redis, &cache_key, role_id).await;
        Ok(Some(role_id))
    } else {
        cache::cache_role_none(&data.core.redis, &cache_key).await;
        Ok(None)
    }
}

pub async fn fetch_reaction_message(
    pool: &PgPool,
    config_id: i64,
    guild_id: GuildId,
) -> Result<ReactionMessage, (StatusCode, String)> {
    let row = sqlx::query_as!(
        RawReactionMessage,
        r#"
        SELECT id, message_id, channel_id, mode as "mode: InteractionMode", message as "message: Json<MessageLayout>"
        FROM reaction_messages
        WHERE id = $1 AND guild_id = $2
        "#,
        config_id,
        guild_id.get().cast_signed(),
    )
    .fetch_optional(pool)
    .await
    .inspect_err(|e| warn!(error = ?e, "reaction roles database record lookup failed"))
    .map_err(|_e| {
        (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error.".to_string())
    })?
    .ok_or_else(|| {
        warn!(config_id, "reaction message not found");
        (StatusCode::NOT_FOUND, "Reaction configuration not found".to_string())
    })?;

    Ok(row.into())
}

/// Fetches associated reaction roles configuration from the database
pub async fn fetch_active_reactions(
    pool: &PgPool,
    reaction_message_id: i64,
) -> Result<Vec<ReactionRole>, (StatusCode, String)> {
    sqlx::query_as!(
        ReactionRole,
        r#"
        SELECT emoji
        FROM reaction_roles
        WHERE reaction_message_id = $1
        "#,
        reaction_message_id
    )
    .fetch_all(pool)
    .await
    .inspect_err(|e| warn!(error = ?e, "reaction role list lookup failed"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })
}

pub async fn fetch_buttons(
    pool: &PgPool,
    reaction_message_id: i64,
) -> Result<Vec<ButtonRole>, (StatusCode, String)> {
    sqlx::query_as!(
        ButtonRole,
        r#"
        SELECT custom_id, label, style as "style: ButtonStyle", emoji
        FROM button_roles
        WHERE reaction_message_id = $1
        "#,
        reaction_message_id,
    )
    .fetch_all(pool)
    .await
    .inspect_err(|e| warn!(error = ?e, "button details lookup failed"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })
}

pub async fn delete_message_from_db(
    state: &Arc<WebState>,
    config_id: i64,
) -> Result<(), (StatusCode, String)> {
    sqlx::query!(
        "UPDATE reaction_messages SET message_id = NULL WHERE id = $1",
        config_id
    )
    .execute(&state.core.db)
    .await
    .inspect_err(|e| error!(error = ?e, "message id not cleared in the database"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })?;
    Ok(())
}

pub async fn add_message_to_db(
    state: &Arc<WebState>,
    config_row: &ReactionMessage,
    message_id: MessageId,
) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        "UPDATE reaction_messages SET message_id = $1 WHERE id = $2",
        message_id.get().cast_signed(),
        config_row.id
    )
    .execute(&state.core.db)
    .await
}

/// Resolves the role behind a button click.
///
/// Scoped by message: `custom_id` is only unique within one configuration (see the
/// `UNIQUE (reaction_message_id, custom_id)` constraint), so a bare `custom_id` lookup could
/// answer with another panel's mapping.
pub async fn get_button_role(
    data: &BotData,
    guild_id: GuildId,
    message_id: MessageId,
    custom_id: &str,
) -> Result<Option<RoleId>, Error> {
    let cache_key = cache::button_role_key(guild_id.get(), message_id, custom_id);

    if let Some(cached) = cache::get_cached_role(&data.core.redis, &cache_key).await {
        return Ok(cached);
    }

    let row = sqlx::query!(
        r#"
        SELECT br.role_id
        FROM button_roles br
        JOIN reaction_messages rm ON br.reaction_message_id = rm.id
        WHERE br.custom_id = $1
          AND rm.message_id = $2
          AND rm.guild_id = $3
        "#,
        custom_id,
        message_id.get().cast_signed(),
        guild_id.get().cast_signed(),
    )
    .fetch_optional(&data.core.db)
    .await?;

    if let Some(record) = row {
        let role_id = RoleId::new(record.role_id.cast_unsigned());
        cache::cache_role(&data.core.redis, &cache_key, role_id).await;
        Ok(Some(role_id))
    } else {
        cache::cache_role_none(&data.core.redis, &cache_key).await;
        Ok(None)
    }
}
