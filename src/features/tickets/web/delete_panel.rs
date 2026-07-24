use crate::core::config::state::WebState;
use crate::shared::error;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use std::sync::Arc;
use tracing::{debug, error, instrument, warn};

#[derive(Deserialize, Debug)]
pub struct DeleteTicketMessagePayload {
    pub channel_id: String,
    pub message_id: String,
}

#[instrument(skip(state))]
pub async fn handle_delete_ticket_message(
    State(state): State<Arc<WebState>>,
    Json(payload): Json<DeleteTicketMessagePayload>,
) -> Result<StatusCode, (StatusCode, String)> {
    let channel_id_u64 = payload.channel_id.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, channel_id = payload.channel_id, "Failed to parse channel ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Channel ID format".to_string()))?;
    let message_id_u64 = payload.message_id.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, raw_message_id = payload.message_id, "Failed to parse message ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Message ID format".to_string()))?;

    let channel = serenity::all::ChannelId::new(channel_id_u64);
    let message_id = serenity::all::MessageId::new(message_id_u64);

    channel.delete_message(&state.http, message_id)
        .await
        .inspect(|_| debug!("Discord message deleted successfully"))
        .or_else(|e| {
            if error::is_unknown_message_error(&e) {
                debug!(error = ?e, "Discord message already deleted or unknown; returning success");
                Ok(())
            } else {
                Err(e)
            }
        })
        .inspect_err(|e| error!(error = ?e, "Failed to delete message via Discord API"))
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|e| (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete Discord message: {}", e),
        ))
}

