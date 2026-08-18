use crate::core::config::state::WebState;
use crate::shared;
use crate::shared::embed::{DEFAULT_EMBED, DiscordEmbed, Format, MessageGetter};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::post,
};
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::GuildId;
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
impl MessageGetter for SendCustomEmbedPayload {
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
    Path(guild_id): Path<GuildId>,
    Json(payload): Json<SendCustomEmbedPayload>,
) -> Result<(StatusCode, Json<SendCustomEmbedResponse>), (StatusCode, String)> {
    debug!(%guild_id, "Received request to dispatch generic embed");

    let target_channel = serenity::ChannelId::new(payload.channel_id);

    let message_builder = shared::embed::create_embed_for_web(&payload, ToString::to_string)?;

    let message = target_channel
        .send_message(&state.serenity_http, message_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, channel_id = payload.channel_id, "Failed to deliver Discord message"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error.".to_string()))?;

    info!(
        %guild_id,
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

/// Registers the general web route for sending custom embeds.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new().route(
        "/guilds/{guild_id}/embeds/send",
        post(handle_send_custom_embed),
    )
}
