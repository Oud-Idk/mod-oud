use crate::web::routes::reaction_role::database;
use crate::web::routes::reaction_role::database::{fetch_active_reactions, fetch_reaction_message};
use crate::web::routes::reaction_role::helpers::{
    build_custom_msg, fetch_and_build_buttons,
    parse_config_id,
};
use crate::web::routes::reaction_role::types::{InteractionMode, ReactionMessage};
use crate::WebState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use poise::serenity_prelude as serenity;
use serde::Serialize;
use sqlx::postgres::PgQueryResult;
use sqlx::Error;
use std::sync::Arc;
use tracing::{debug, info, warn};

#[derive(Serialize)]
pub struct SendReactionMessageResponse {
    pub message_id: String,
}

pub async fn handle_send_reaction_role_message(
    State(state): State<Arc<WebState>>,
    Path((guild_id_str, config_id_str)): Path<(String, String)>,
) -> Result<(StatusCode, Json<SendReactionMessageResponse>), (StatusCode, String)> {
    debug!(
        guild_id = guild_id_str,
        config_id = config_id_str,
        "Dispatching reaction roles message"
    );

    let config_id = parse_config_id(&config_id_str)?;
    let config_row = fetch_reaction_message(&state.pool, config_id, &guild_id_str).await?;

    let channel_id_u64 = config_row.channel_id.parse::<u64>().map_err(|_| {
        (StatusCode::BAD_REQUEST, "Invalid discord channel ID format".to_string())
    })?;
    let channel = serenity::ChannelId::new(channel_id_u64);

    let custom_msg_opt = build_custom_msg(
        &config_row.format,
        config_row.content.as_ref(),
        config_row.embed.as_deref(),
    )?;
    let mut message_builder = custom_msg_opt.unwrap_or_else(|| {
        serenity::CreateMessage::default().content("Please select your roles:")
    });

    match config_row.mode {
        InteractionMode::Button => {
            let button_components = fetch_and_build_buttons(&state.pool, config_row.id).await?;
            if !button_components.is_empty() {
                message_builder = message_builder.components(vec![
                    serenity::CreateActionRow::Buttons(button_components),
                ]);
            }
        }
        InteractionMode::Reaction => {}
    }

    let message = channel
        .send_message(&state.http, message_builder)
        .await
        .map_err(|e| {
            warn!(error = ?e, "Failed to send payload to Discord channel");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed sending Discord interaction message: {}", e))
        })?;

    if matches!(config_row.mode, InteractionMode::Reaction) {
        let reactions = fetch_active_reactions(&state.pool, config_row.id).await?;
        for r in reactions {
            if let Ok(emoji) = r.emoji.parse::<serenity::ReactionType>() {
                if let Err(err) = message.react(&state.http, emoji).await {
                    warn!(error = ?err, "Failed applying reaction emoji to post");
                }
            }
        }
    }

    let message_id_str = message.id.to_string();
    let _ = database::add_message_to_db(&state, config_row, &message_id_str).await;

    info!(
        guild_id = guild_id_str,
        message_id = message_id_str,
        "Reaction role layout successfully processed"
    );

    Ok((
        StatusCode::OK,
        Json(SendReactionMessageResponse {
            message_id: message_id_str,
        }),
    ))
}

