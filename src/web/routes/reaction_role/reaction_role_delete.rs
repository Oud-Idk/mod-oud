use crate::web::routes::reaction_role::database;
use crate::web::routes::reaction_role::database::fetch_reaction_message;
use crate::web::routes::reaction_role::helpers::parse_config_id;
use crate::web::routes::tickets_delete::is_unknown_message_error;
use crate::WebState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use poise::serenity_prelude as serenity;
use std::sync::Arc;
use tracing::{debug, error, instrument, warn};

#[instrument(skip(state))]
pub async fn handle_delete_reaction_role_message(
    State(state): State<Arc<WebState>>,
    Path((guild_id_str, config_id_str)): Path<(String, String)>,
) -> Result<StatusCode, (StatusCode, String)> {
    let config_id = parse_config_id(&config_id_str)?;
    let record = fetch_reaction_message(&state.db, config_id, &guild_id_str).await?;

    let message_id_str = match record.message_id {
        Some(id) if !id == 0 => id,
        _ => return Ok(StatusCode::NO_CONTENT),
    };

    let channel_id_u64 = record.channel_id as u64;
    let message_id_u64 = message_id_str as u64;

    let channel = serenity::ChannelId::new(channel_id_u64);
    let message_id = serenity::MessageId::new(message_id_u64);

    match channel.delete_message(&state.http, message_id).await {
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
                    format!("Failed to delete Discord message: {}", e),
                ));
            }
        }
    }

    database::delete_message_from_db(&state, config_id).await?;

    Ok(StatusCode::NO_CONTENT)
}

