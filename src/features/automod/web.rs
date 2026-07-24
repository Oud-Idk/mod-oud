use axum::{Json, Router};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serenity::all::{CreateChannel, GuildId, PermissionOverwrite, PermissionOverwriteType, Permissions, RoleId};
use std::sync::Arc;
use axum::routing::post;
use tracing::{debug, warn};
use crate::core::config::state::WebState;

#[derive(Deserialize)]
pub struct SetupHoneypotPayload {
    pub channel_name: String,
}

#[derive(Serialize)]
pub struct SetupHoneypotResponse {
    pub channel_id: String,
}

pub async fn setup_honeypot_channel(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<SetupHoneypotPayload>,
) -> Result<(StatusCode, Json<SetupHoneypotResponse>), (StatusCode, String)> {
    let guild_id_u64 = guild_id_str.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, guild_id_str = guild_id_str, "Failed to parse guild ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Guild ID format".to_string()))?;

    let guild_id = GuildId::from(guild_id_u64);
    let permission_overwrite = PermissionOverwrite {
        allow: Permissions::SEND_MESSAGES | Permissions::VIEW_CHANNEL,
        deny: Permissions::empty(),
        kind: PermissionOverwriteType::Role(RoleId::new(guild_id.get())),
    };

    let channel_builder = CreateChannel::new(payload.channel_name)
        .permissions(vec![permission_overwrite]);

    let channel = guild_id.create_channel(&state.http, channel_builder).await
        .inspect_err(|e| warn!(error = ?e, guild_id_str = guild_id_str, "Failed to create channel"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Failed to create channel".to_string()))?;

    debug!("Created honeypot channel: {:?}", channel.id);

    Ok((StatusCode::OK, Json(SetupHoneypotResponse {
        channel_id: channel.id.to_string()
    })))
}

pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/guilds/{guild_id}/honeypot", post(setup_honeypot_channel))
}