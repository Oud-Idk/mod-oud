use crate::core::config::get_settings;
use crate::utils::ticket::build_ticket_message_payload;
use crate::WebState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{debug, info, instrument, warn};

#[derive(Deserialize, Debug)]
pub struct SendTicketMessagePayload {
    pub channel_id: String,
}

#[derive(Serialize)]
pub struct SendTicketMessageResponse {
    pub message_id: String,
}

#[instrument(skip(state))]
pub async fn handle_send_ticket_message(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<SendTicketMessagePayload>,
) -> Result<(StatusCode, Json<SendTicketMessageResponse>), (StatusCode, String)> {
    debug!(guild_id = guild_id_str, "Axum ticket panel dispatch endpoint triggered");

    let guild_id = guild_id_str.parse::<i64>()
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Guild ID format".to_string()))?;

    let channel_id_u64 = payload.channel_id.parse::<u64>()
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Channel ID format".to_string()))?;

    let settings = get_settings(&state.db, &state.redis.clone(), &state.guild_configs, guild_id)
        .await
        .inspect_err(|e| warn!(error = ?e, guild_id, "Failed to load guild configuration settings"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let ticket_cfg = settings.tickets.ok_or_else(|| {
        debug!(guild_id, "Ticket dispatch failed: system is unconfigured");
        (StatusCode::BAD_REQUEST, "Ticket system is not configured yet.".to_string())
    })?;

    let serenity_guild_id = serenity::GuildId::new(guild_id as u64);
    let channel = serenity::ChannelId::new(channel_id_u64);

    let message_builder = build_ticket_message_payload(
        &state.http,
        serenity_guild_id,
        ticket_cfg.ticket_role_id,
        Some(&ticket_cfg.format),
        ticket_cfg.content.as_ref(),
        ticket_cfg.embed.as_ref(),
    )
        .await
        .inspect_err(|e| warn!(error = ?e, guild_id, "Failed to compile custom ticket layout payload"))
        .map_err(|e| (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to build ticket message layout: {}", e),
        ))?;

    let message = channel
        .send_message(&state.http, message_builder).await
        .inspect_err(|e| warn!(error = ?e, guild_id, channel_id = channel_id_u64, "Failed to send Discord panel message"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed...: {e}")))?;

    info!(guild_id, channel_id = channel_id_u64, message_id = message.id.get(), "Ticket panel message dispatched successfully via Web API!");

    Ok((StatusCode::OK, Json(SendTicketMessageResponse { message_id: message.id.to_string() })))
}