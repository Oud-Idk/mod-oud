use crate::core::config::state::WebState;
use crate::features::reaction_roles;
use crate::features::reaction_roles::database::fetch_reaction_message;
use crate::features::reaction_roles::web::helpers::parse_config_id;
use crate::shared::error::is_unknown_message_error;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use std::sync::Arc;
use tracing::{debug, error, instrument};

#[instrument(skip(state))]
pub async fn handle_delete_reaction_role_message(
    State(state): State<Arc<WebState>>,
    Path((guild_id_str, config_id_str)): Path<(String, String)>,
) -> Result<StatusCode, (StatusCode, String)> {
    let config_id = parse_config_id(&config_id_str)?;
    let record = fetch_reaction_message(&state.core.db, config_id, &guild_id_str).await?;

    let message_id_str = match record.message_id {
        Some(id) if !id == 0 => id,
        _ => return Ok(StatusCode::NO_CONTENT),
    };

    let Some(channel_id_u64) = record.channel_id.map(|id| id as u64) else {
        debug!("Channel ID is not specified, skipping.");
        return Err((StatusCode::BAD_REQUEST, "Channel ID is not specified".to_string()));
    };
    let message_id_u64 = message_id_str as u64;

    let channel = serenity::all::ChannelId::new(channel_id_u64);
    let message_id = serenity::all::MessageId::new(message_id_u64);

    match channel.delete_message(&state.serenity_http, message_id).await {
        Ok(_) => {
            debug!("Discord message deleted successfully");
        }
        Err(e) => {
            if is_unknown_message_error(&e) {
                debug!(error = ?e, "Discord message already deleted; proceeding with cleanup");
            } else {
                error!(error = ?e, "Failed to delete message via Discord API");
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal Server Error".to_string(),
                ));
            }
        }
    }

    reaction_roles::database::delete_message_from_db(&state, config_id).await?;

    Ok(StatusCode::NO_CONTENT)
}