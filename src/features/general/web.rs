use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::state::WebState;
use crate::shared;
use crate::shared::embed::DiscordEmbed;
use crate::shared::embed::EmbedGetters;
use crate::shared::embed::Format;
use crate::shared::embed::build_custom_message;
use axum::{extract::{Path, State}, http::StatusCode, Json, Router};
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use serenity::gateway::ShardRunnerInfo;
use std::sync::Arc;
use axum::routing::post;
use serde_with::{serde_as, DisplayFromStr};
use tracing::{debug, info, warn};

#[serde_as]
#[derive(Deserialize)]
pub struct SendCustomEmbedPayload {
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: u64,
    pub content: Option<String>,
    pub embed: Option<DiscordEmbed>,
    pub format: Option<Format>,
}

#[serde_as]
#[derive(Serialize)]
pub struct SendCustomEmbedResponse {
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: u64,
}

impl EmbedGetters for SendCustomEmbedPayload {
    fn content(&self) -> Option<&str> {
        self.content.as_deref()
    }
    fn embed(&self) -> Option<&DiscordEmbed> {
        self.embed.as_ref()
    }
    fn format(&self) -> Option<&Format> { self.format.as_ref() }
}


/// Generic handler to deliver custom embeds or messages directly to a channel.
pub async fn handle_send_custom_embed(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<SendCustomEmbedPayload>,
) -> Result<(StatusCode, Json<SendCustomEmbedResponse>), (StatusCode, String)> {
    debug!(guild_id = guild_id_str, "Received request to dispatch generic embed");

    let guild_id_u64 = guild_id_str.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, guild_id_str = guild_id_str, "Failed to parse guild ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Guild ID format".to_string()))?;

    let target_channel = serenity::ChannelId::new(payload.channel_id);

    let message_builder = match shared::embed::create_embed_for_web(&payload, None::<fn(&str) -> String>) {
        Ok(value) => value,
        Err(value) => return Err(value),
    };

    let message = target_channel
        .send_message(&state.http, message_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, channel_id = payload.channel_id, "Failed to deliver Discord message"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Discord API error: {}", e),))?;

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
        .route("/guilds/{guild_id}/embeds/send", post(handle_send_custom_embed))
}