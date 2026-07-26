use crate::core::config::state::WebState;
use crate::features::giveaways::web::helpers::parse_config_id;
use crate::shared::error::is_unknown_message_error;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serenity::all::{ChannelId, MessageId};
use std::sync::Arc;
use tracing::{debug, error};
use crate::features::giveaways;

pub async fn handle_delete_giveaway_message(
    State(state): State<Arc<WebState>>,
    Path((guild_id_str, config_id_str)): Path<(String, String)>,
) -> Result<StatusCode, (StatusCode, String)> {
    let config_id = parse_config_id(&config_id_str)?;
    let record = giveaways::database::fetch_giveaway(&state.db, config_id, &guild_id_str).await?;

    let Some(channel_id) = record.channel_id else {
        return Err((StatusCode::BAD_REQUEST, "Tried to delete a message that doesn't exist".to_string()));
    };

    let message_id_i64 = match record.message_id {
        Some(id) if id != 0 => id,
        _ => return Ok(StatusCode::NO_CONTENT),
    };

    let channel = ChannelId::new(channel_id as u64);
    let message_id = MessageId::new(message_id_i64 as u64);

    match channel.delete_message(&state.http, message_id).await {
        Ok(_) => debug!("Discord giveaway message deleted successfully"),
        Err(e) => {
            if is_unknown_message_error(&e) {
                debug!("Discord message already deleted; proceeding with DB cleanup");
            } else {
                error!(error = ?e, "Failed to delete message via Discord API");
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to delete Discord message: {}", e),
                ));
            }
        }
    }

    giveaways::database::clear_giveaway_message_id(&state.db, config_id).await?;

    Ok(StatusCode::NO_CONTENT)
}