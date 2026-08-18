use crate::core::config::settings::get_settings;
use crate::core::config::state::WebState;
use crate::features::tickets::panel::build_ticket_message_payload;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{ChannelId, GuildId, MessageId};
use std::sync::Arc;
use tracing::{debug, info, instrument, warn};

#[serde_as]
#[derive(Deserialize, Debug)]
pub struct SendTicketMessagePayload {
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: ChannelId,
}

#[serde_as]
#[derive(Serialize)]
pub struct SendTicketMessageResponse {
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: MessageId,
}

#[instrument(skip(state))]
pub async fn handle_send_ticket_message(
    State(state): State<Arc<WebState>>,
    Path(guild_id): Path<GuildId>, // Directly extracts into GuildId
    Json(payload): Json<SendTicketMessagePayload>,
) -> Result<(StatusCode, Json<SendTicketMessageResponse>), (StatusCode, String)> {
    debug!(
        %guild_id,
        "Axum ticket panel dispatch endpoint triggered"
    );

    let settings = get_settings(
        &state.core.db,
        &state.core.redis,
        &state.core.guild_configs_cache,
        guild_id,
    )
    .await
    .inspect_err(|e| warn!(error = ?e, %guild_id, "Failed to load guild configuration settings"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })?;

    let ticket_cfg = settings.tickets.ok_or_else(|| {
        debug!(%guild_id, "Ticket dispatch failed: system is unconfigured");
        (
            StatusCode::BAD_REQUEST,
            "Ticket system is not configured yet.".to_string(),
        )
    })?;

    let Some(ticket_role_id) = ticket_cfg.ticket_role_id else {
        debug!(
            %guild_id,
            "Ticket dispatch failed: support staff role is unconfigured"
        );
        return Err((
            StatusCode::BAD_REQUEST,
            "Support staff role must be configured before posting the ticket panel.".to_string(),
        ));
    };

    let message_builder = build_ticket_message_payload(
        &state.serenity_http,
        guild_id,
        ticket_role_id,
        ticket_cfg.panel_message.message.format,
        &ticket_cfg.panel_message.message.content,
        &ticket_cfg.panel_message.message.embed,
    )
    .await
    .inspect_err(|e| warn!(error = ?e, %guild_id, "Failed to compile custom ticket layout payload"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })?;

    let message = payload
        .channel_id
        .send_message(&state.serenity_http, message_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, %guild_id, channel_id = %payload.channel_id, "Failed to send Discord panel message"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error".to_string()))?;

    info!(
        %guild_id,
        channel_id = %payload.channel_id,
        message_id = %message.id,
        "Ticket panel message dispatched successfully via Web API!"
    );

    Ok((
        StatusCode::OK,
        Json(SendTicketMessageResponse {
            message_id: message.id,
        }),
    ))
}
