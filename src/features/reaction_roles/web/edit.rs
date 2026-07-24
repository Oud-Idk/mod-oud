use crate::core::config::state::WebState;
use crate::features::reaction_roles::database::fetch_reaction_message;
use crate::features::reaction_roles::types::InteractionMode;
use crate::features::reaction_roles::web;
use crate::features::reaction_roles::web::helpers::{build_custom_msg, convert_create_to_edit_message, fetch_and_build_buttons, parse_config_id};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Serialize;
use serenity::all::{ChannelId, MessageId};
use std::sync::Arc;
use tracing::{debug, info, warn};

#[derive(Serialize)]
pub struct EditReactionMessageResponse {
    pub message_id: String,
}

pub async fn handle_edit_reaction_role_message(
    State(state): State<Arc<WebState>>,
    Path((guild_id_str, config_id_str)): Path<(String, String)>,
) -> Result<(StatusCode, Json<EditReactionMessageResponse>), (StatusCode, String)> {
    debug!(
        guild_id = guild_id_str,
        config_id = config_id_str,
        "Editing existing reaction roles message"
    );

    let config_id = parse_config_id(&config_id_str)?;
    let config_row = fetch_reaction_message(&state.db, config_id, &guild_id_str).await?;

    let channel_id_u64 = config_row.channel_id as u64;
    let channel_id = ChannelId::new(channel_id_u64);

    let message_id_i64 = config_row.message_id.ok_or_else(|| {
        (StatusCode::BAD_REQUEST, "Cannot edit a message that hasn't been sent yet!".to_string())
    })?;
    let message_id_u64 = message_id_i64 as u64;
    let message_id = MessageId::new(message_id_u64);

    let custom_msg_opt = build_custom_msg(
        &config_row.format,
        config_row.content.as_deref(),
        config_row.embed.as_deref(),
    )?;
    let mut edit_builder = convert_create_to_edit_message(custom_msg_opt);

    match config_row.mode {
        InteractionMode::Button => {
            let button_components = fetch_and_build_buttons(&state.db, config_row.id).await?;
            if !button_components.is_empty() {
                edit_builder = edit_builder.components(vec![
                    serenity::all::CreateActionRow::Buttons(button_components),
                ]);
            } else {
                edit_builder = edit_builder.components(Vec::new());
            }
        }
        InteractionMode::Reaction => {
            edit_builder = edit_builder.components(Vec::new());
        }
    }

    channel_id
        .edit_message(&state.http, message_id, edit_builder)
        .await
        .map_err(|e| {
            warn!(error = ?e, "Failed to edit Discord message");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed editing Discord interaction message: {}", e))
        })?;

    if matches!(config_row.mode, InteractionMode::Reaction) {
        web::helpers::edit_reactions(&state, &config_row, &channel_id, &message_id).await?;
    }

    info!(
        guild_id = guild_id_str,
        message_id = message_id_i64,
        "Reaction role layout successfully edited"
    );

    Ok((
        StatusCode::OK,
        Json(EditReactionMessageResponse {
            message_id: message_id_i64.to_string(),
        }),
    ))
}