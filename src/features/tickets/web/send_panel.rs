use crate::core::config::state::WebState;
use crate::core::config::settings::get_settings;
use crate::features::tickets::panel::build_ticket_message_payload;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use serde_with::{serde_as, DisplayFromStr};
use tracing::{debug, info, instrument, warn};

#[serde_as]
#[derive(Deserialize, Debug)]
pub struct SendTicketMessagePayload {
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: u64,
}

#[serde_as]
#[derive(Serialize)]
pub struct SendTicketMessageResponse {
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: u64,
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

    let settings = get_settings(&state.db, &state.redis.clone(), &state.guild_configs, guild_id)
        .await
        .inspect_err(|e| warn!(error = ?e, guild_id, "Failed to load guild configuration settings"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let ticket_cfg = settings.tickets.ok_or_else(|| {
        debug!(guild_id, "Ticket dispatch failed: system is unconfigured");
        (StatusCode::BAD_REQUEST, "Ticket system is not configured yet.".to_string())
    })?;

    let serenity_guild_id = serenity::all::GuildId::new(guild_id as u64);
    let channel = serenity::all::ChannelId::new(payload.channel_id);

    let Some(ticket_role_id) = ticket_cfg.ticket_role_id else {
        debug!(guild_id, "Ticket dispatch failed: support staff role is unconfigured");
        return Err((
            StatusCode::BAD_REQUEST,
            "Support staff role must be configured before posting the ticket panel.".to_string(),
        ));
    };

    let message_builder = build_ticket_message_payload(
        &state.http,
        serenity_guild_id,
        ticket_role_id,
        ticket_cfg.panel_message.message.format,
        &ticket_cfg.panel_message.message.content,
        &ticket_cfg.panel_message.message.embed,
    )
        .await
        .inspect_err(|e| warn!(error = ?e, guild_id, "Failed to compile custom ticket layout payload"))
        .map_err(|e| (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to build ticket message layout: {}", e),
        ))?;

    let message = channel
        .send_message(&state.http, message_builder).await
        .inspect_err(|e| warn!(error = ?e, guild_id, channel_id = payload.channel_id, "Failed to send Discord panel message"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed...: {e}")))?;

    info!(guild_id, channel_id = payload.channel_id, message_id = message.id.get(), "Ticket panel message dispatched successfully via Web API!");

    Ok((StatusCode::OK, Json(SendTicketMessageResponse { message_id: message.id.get() })))
}