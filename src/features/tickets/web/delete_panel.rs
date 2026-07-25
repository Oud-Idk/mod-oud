use crate::core::config::state::WebState;
use crate::shared::error;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use std::sync::Arc;
use serde_with::{serde_as, DisplayFromStr};
use tracing::{debug, error, instrument, warn};


#[serde_as]
#[derive(Deserialize, Debug)]
pub struct DeleteTicketMessagePayload {
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: u64,
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: u64,
}

#[instrument(skip(state))]
pub async fn handle_delete_ticket_message(
    State(state): State<Arc<WebState>>,
    Json(payload): Json<DeleteTicketMessagePayload>,
) -> Result<StatusCode, (StatusCode, String)> {
    let channel = serenity::all::ChannelId::new(payload.channel_id);
    let message_id = serenity::all::MessageId::new(payload.message_id);

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

