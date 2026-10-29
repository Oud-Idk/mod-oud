use crate::core::config::state::WebState;
use crate::shared;
use crate::shared::embed::{DEFAULT_EMBED, DiscordEmbed, Format, MessageGetter};
use crate::shared::guild_resource::ensure_channel_in_guild;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
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
    debug!(%guild_id, "custom message send requested");

    let target_channel = serenity::ChannelId::new(payload.channel_id);

    ensure_channel_in_guild(&state.serenity_http, target_channel, guild_id).await?;

    let message_builder = shared::embed::create_embed_for_web(&payload, ToString::to_string)?;

    let message = target_channel
        .send_message(&state.serenity_http, message_builder)
        .await
        .inspect_err(
            |e| warn!(error = %e, channel_id = payload.channel_id, "custom message not delivered"),
        )
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error.".to_string(),
            )
        })?;

    info!(
        %guild_id,
        channel_id = payload.channel_id,
        message_id = %message.id,
        "custom message delivered"
    );

    Ok((
        StatusCode::OK,
        Json(SendCustomEmbedResponse {
            message_id: message.id.get(),
        }),
    ))
}

/// Reports whether this deployment has the ML toxicity classifier enabled.
pub async fn handle_heavy_features(State(state): State<Arc<WebState>>) -> Json<bool> {
    Json(state.core.config.heavy_features)
}

/// Returns the system telemetry report covering database, redis, and memory.
pub async fn handle_telemetry(
    State(state): State<Arc<WebState>>,
) -> Json<super::telemetry::TelemetryReport> {
    let report =
        super::telemetry::collect_core_telemetry(&state.core.db, &state.core.redis).await;
    Json(report)
}

/// Registers the general web routes.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/heavy-features", get(handle_heavy_features))
        .route("/telemetry", get(handle_telemetry))
        .route(
            "/guilds/{guild_id}/embeds/send",
            post(handle_send_custom_embed),
        )
}

