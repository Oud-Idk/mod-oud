use crate::WebState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use poise::serenity_prelude as serenity;
use serde::Deserialize;
use std::sync::Arc;
use tracing::{debug, error, instrument, warn};
// Added tracing imports

#[derive(Deserialize, Debug)] // Added Debug so tracing can inspect the payload
pub struct DeleteTicketMessagePayload {
    pub channel_id: String,
    pub message_id: String,
}

fn is_unknown_message_error(err: &serenity::Error) -> bool {
    if let serenity::Error::Http(http_err) = err {
        if let serenity::HttpError::UnsuccessfulRequest(error_response) = http_err {
            return error_response.error.code == 10008;
        }
    }
    false
}

#[instrument(skip(state))]
pub async fn handle_delete_ticket_message(
    State(state): State<Arc<WebState>>,
    Path(_guild_id_str): Path<String>,
    Json(payload): Json<DeleteTicketMessagePayload>,
) -> Result<StatusCode, (StatusCode, String)> {
    let channel_id_u64 = payload.channel_id.parse::<u64>().map_err(|e| {
        warn!(error = %e, raw_channel_id = %payload.channel_id, "Failed to parse channel ID");
        (StatusCode::BAD_REQUEST, "Invalid Channel ID format".to_string())
    })?;

    let message_id_u64 = payload.message_id.parse::<u64>().map_err(|e| {
        warn!(error = %e, raw_message_id = %payload.message_id, "Failed to parse message ID");
        (StatusCode::BAD_REQUEST, "Invalid Message ID format".to_string())
    })?;

    let channel = serenity::ChannelId::new(channel_id_u64);
    let message_id = serenity::MessageId::new(message_id_u64);

    match channel.delete_message(&state.http, message_id).await {
        Ok(_) => {
            debug!("Discord message deleted successfully");
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            if is_unknown_message_error(&e) {
                debug!(error = ?e, "Discord message already deleted or unknown; returning success");
                return Ok(StatusCode::NO_CONTENT);
            }

            error!(error = ?e, "Failed to delete message via Discord API");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to delete Discord message: {}", e),
            ))
        }
    }?;

    Ok(StatusCode::NO_CONTENT)
}