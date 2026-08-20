use crate::core::config::state::WebState;
use crate::shared::error;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{ChannelId, MessageId};
use std::sync::Arc;
use tracing::{debug, error, instrument};

#[serde_as]
#[derive(Deserialize, Debug)]
pub struct DeleteTicketMessagePayload {
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: ChannelId,
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: MessageId,
}

#[instrument(skip(state))]
pub async fn handle_delete_ticket_message(
    State(state): State<Arc<WebState>>,
    Json(payload): Json<DeleteTicketMessagePayload>,
) -> Result<StatusCode, (StatusCode, String)> {
    match payload
        .channel_id
        .delete_message(&state.serenity_http, payload.message_id)
        .await
    {
        Ok(()) => {
            debug!("Discord message deleted successfully");
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) if error::is_unknown_message_error(&e) => {
            debug!(error = ?e, "Discord message already deleted or unknown; returning success");
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            error!(error = ?e, "Failed to delete message via Discord API");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error.".to_string(),
            ))
        }
    }
}
