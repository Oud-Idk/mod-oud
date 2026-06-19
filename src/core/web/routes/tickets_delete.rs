use crate::WebState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use poise::serenity_prelude as serenity;
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
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

pub async fn handle_delete_ticket_message(
    State(state): State<Arc<WebState>>,
    Path(_guild_id_str): Path<String>, // Prefixed with underscore if unused
    Json(payload): Json<DeleteTicketMessagePayload>,
) -> Result<StatusCode, (StatusCode, String)> {
    let channel_id_u64 = payload.channel_id.parse::<u64>().map_err(|_| {
        (StatusCode::BAD_REQUEST, "Invalid Channel ID format".to_string())
    })?;

    let message_id_u64 = payload.message_id.parse::<u64>().map_err(|_| {
        (StatusCode::BAD_REQUEST, "Invalid Message ID format".to_string())
    })?;

    let channel = serenity::ChannelId::new(channel_id_u64);
    let message_id = serenity::MessageId::new(message_id_u64);

    match channel.delete_message(&state.http, message_id).await {
        Ok(_) => Ok(StatusCode::NO_CONTENT),
        Err(e) => {
            if is_unknown_message_error(&e) {
                return Ok(StatusCode::NO_CONTENT);
            }

            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to delete Discord message: {}", e),
            ))
        }
    }?;


    Ok(StatusCode::NO_CONTENT)
}