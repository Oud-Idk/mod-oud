use crate::core::config::get_guild_ctx;
use crate::types::config::config::Format;
use crate::types::embed::DiscordEmbed;
use crate::utils::custom_msg::build_custom_message;
use crate::web::helpers::embed;
use crate::web::helpers::embed::ContentAndFormat;
use crate::web::routes::send_temp_voice_interface::SendTempVoiceInterfacePayload;
use crate::WebState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use serenity::gateway::ShardRunnerInfo;
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

impl ContentAndFormat for SendCustomEmbedPayload {
    fn content(&self) -> Option<&str> {
        self.content.as_deref()
    }

    fn embed(&self) -> Option<&DiscordEmbed> {
        self.embed.as_ref()
    }
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

    let is_embed = payload.format.as_ref().map_or(true, |f| matches!(f, Format::Embed));

    let message_builder = match embed::create_embed_for_web(&payload, is_embed, None::<fn(&str) -> String>) {
        Ok(value) => value,
        Err(value) => return Err(value),
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