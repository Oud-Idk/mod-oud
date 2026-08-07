use crate::core::config::state::WebState;
use crate::shared;
use crate::shared::embed::{DiscordEmbed, EmbedGetters, Format, DEFAULT_EMBED};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::post,
    Json, Router,
};
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, DisplayFromStr};
use std::sync::Arc;
use tracing::{debug, info, warn};

#[serde_as]
#[derive(Deserialize)]
pub struct SendCustomEmbedPayload {
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: u64,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub embed: Option<DiscordEmbed>,
    #[serde(default)]
    pub format: Option<Format>,
}

#[serde_as]
#[derive(Serialize)]
pub struct SendCustomEmbedResponse {
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: u64,
}

// Fixed trait implementation to match EmbedGetters signatures exactly
impl EmbedGetters for SendCustomEmbedPayload {
    fn content(&self) -> &str {
        self.content.as_deref().unwrap_or("")
    }

    fn embed(&self) -> &DiscordEmbed {
        self.embed.as_ref().unwrap_or(&DEFAULT_EMBED)
    }

    fn format(&self) -> Format {
        self.format.unwrap_or_default()
    }
}

/// Generic handler to deliver custom embeds or messages directly to a channel.
pub async fn handle_send_custom_embed(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<SendCustomEmbedPayload>,
) -> Result<(StatusCode, Json<SendCustomEmbedResponse>), (StatusCode, String)> {
    debug!(guild_id = guild_id_str, "Received request to dispatch generic embed");

    let guild_id_u64 = guild_id_str
        .parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, guild_id_str = guild_id_str, "Failed to parse guild ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Guild ID format".to_string()))?;

    let target_channel = serenity::ChannelId::new(payload.channel_id);

    let message_builder = shared::embed::create_embed_for_web(&payload, |text| text.to_string())?;

    let message = target_channel
        .send_message(&state.http, message_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, channel_id = payload.channel_id, "Failed to deliver Discord message"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Discord API error: {}", e)))?;

    info!(
        guild_id = guild_id_u64,
        channel_id = payload.channel_id,
        message_id = %message.id,
        "Custom message successfully delivered"
    );

    Ok((
        StatusCode::OK,
        Json(SendCustomEmbedResponse {
            message_id: message.id.get(),
        }),
    ))
}

pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        // Fixed Axum route path syntax (:guild_id instead of {guild_id})
        .route("/guilds/:guild_id/embeds/send", post(handle_send_custom_embed))
}