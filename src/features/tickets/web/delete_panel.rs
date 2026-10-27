use crate::core::config::state::WebState;
use crate::shared::error;
use crate::shared::guild_resource::channel_in_guild;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{ChannelId, GuildId, MessageId};
use std::sync::Arc;
use tracing::{debug, instrument, warn};

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
    Path(guild_id): Path<GuildId>,
    Json(payload): Json<DeleteTicketMessagePayload>,
) -> Result<StatusCode, (StatusCode, String)> {
    // The panel target arrives in the body, so it has to be proven against the route guild
    // before the bot's credentials touch it.
    match channel_in_guild(&state.serenity_http, payload.channel_id, guild_id).await {
        Ok(true) => {}
        Ok(false) => {
            warn!(
                %guild_id,
                channel_id = %payload.channel_id,
                "rejected ticket panel delete; the channel belongs to another guild"
            );
            return Err((
                StatusCode::FORBIDDEN,
                "That channel does not belong to this server.".to_string(),
            ));
        }
        Err(e) if error::is_not_found_error(&e) => {
            debug!(
                %guild_id,
                channel_id = %payload.channel_id,
                "ticket panel delete skipped; the channel is already gone"
            );
            return Ok(StatusCode::NO_CONTENT);
        }
        Err(e) => {
            warn!(error = ?e, %guild_id, channel_id = %payload.channel_id, "ticket panel channel lookup failed");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error.".to_string(),
            ));
        }
    }

    match payload
        .channel_id
        .delete_message(&state.serenity_http, payload.message_id)
        .await
    {
        Ok(()) => {
            debug!(%payload.channel_id, %payload.message_id, "ticket panel message deleted via discord");
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) if error::is_unknown_message_error(&e) => {
            debug!(%payload.channel_id, %payload.message_id, "ticket panel message already gone per discord");
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            warn!(
                error = ?e,
                %payload.channel_id,
                %payload.message_id,
                "ticket panel message delete via discord failed"
            );
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error.".to_string(),
            ))
        }
    }
}
