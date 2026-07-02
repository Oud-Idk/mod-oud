use crate::core::config::get_guild_ctx;
use crate::types::config::config::Format;
use crate::types::embed::DiscordEmbed;
use crate::utils::custom_msg::build_custom_message;
use crate::WebState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{debug, info, warn};

#[derive(Deserialize)]
pub struct SendCustomEmbedPayload {
    pub channel_id: String,
    pub content: Option<String>,
    pub embed: Option<DiscordEmbed>,
    pub format: Option<Format>,
}

#[derive(Serialize)]
pub struct SendCustomEmbedResponse {
    pub message_id: String,
}

/// Generic handler to deliver custom embeds or messages directly to a channel.
pub async fn handle_send_custom_embed(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<SendCustomEmbedPayload>,
) -> Result<(StatusCode, Json<SendCustomEmbedResponse>), (StatusCode, String)> {
    debug!(guild_id = guild_id_str, "Received request to dispatch generic embed");

    let guild_id = guild_id_str.parse::<i64>().map_err(|_| {
        (StatusCode::BAD_REQUEST, "Invalid Guild ID format".to_string())
    })?;

    let channel_id_u64 = payload.channel_id.parse::<u64>().map_err(|_| {
        (StatusCode::BAD_REQUEST, "Invalid Channel ID format".to_string())
    })?;

    let target_channel = serenity::ChannelId::new(channel_id_u64);

    let is_embed = payload.format.map_or(true, |f| matches!(f, Format::Embed));

    let message_builder = match build_custom_message(
        is_embed,
        payload.content.as_ref(),
        payload.embed.as_ref(),
        |v| { v.to_string() }, // do nothing
    ) {
        Ok(Some(builder)) => builder,
        Ok(None) => {
            return Err((
                StatusCode::BAD_REQUEST,
                "Cannot send an empty message. Please provide either text content or a populated embed.".to_string(),
            ));
        }
        Err(e) => {
            warn!(error = ?e, "Failed to parse custom embed format");
            return Err((
                StatusCode::BAD_REQUEST,
                format!("Failed to compile embed: {}", e),
            ));
        }
    };

    let message = target_channel
        .send_message(&state.http, message_builder)
        .await
        .map_err(|e| {
            warn!(error = ?e, channel_id = channel_id_u64, "Failed to deliver Discord message");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Discord API error: {}", e),
            )
        })?;

    info!(
        guild_id,
        channel_id = channel_id_u64,
        message_id = %message.id,
        "Custom message successfully delivered"
    );

    Ok((
        StatusCode::OK,
        Json(SendCustomEmbedResponse {
            message_id: message.id.to_string(),
        }),
    ))
}