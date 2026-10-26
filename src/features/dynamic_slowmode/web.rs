use crate::core::config::settings::get_settings;
use crate::core::config::state::WebState;
use crate::features::dynamic_slowmode::cache;
use crate::features::dynamic_slowmode::commands::disarm_label;
use crate::features::dynamic_slowmode::database;
use crate::features::dynamic_slowmode::types::DynamicSlowmodeConfig;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use poise::serenity_prelude as serenity;
use serde::Serialize;
use std::sync::Arc;
use tracing::{debug, warn};

/// One channel's live automation state.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlowmodeChannelStatus {
    pub channel_id: String,
    pub pre_automation_secs: u16,
    pub last_written_secs: u16,
    pub authors: u32,
    pub volume: u32,
    pub armed: bool,
    pub status: &'static str,
}

/// The guild's policy plus what it is doing right now.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlowmodeStatusResponse {
    pub config: DynamicSlowmodeConfig,
    pub channels: Vec<SlowmodeChannelStatus>,
}

/// Returns the guild's dynamic slowmode policy and per-channel live state.
///
/// The dashboard's counts are then the ones the tick actually acts on, not a guess.
pub async fn handle_status(
    State(state): State<Arc<WebState>>,
    Path(guild_id): Path<serenity::GuildId>,
) -> Result<(StatusCode, Json<SlowmodeStatusResponse>), (StatusCode, String)> {
    let settings = get_settings(
        &state.core.db,
        &state.core.redis,
        &state.core.guild_configs_cache,
        guild_id,
    )
    .await
    .inspect_err(|e| warn!(error = ?e, %guild_id, "slowmode settings lookup failed"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error".to_string(),
        )
    })?;

    let config = settings
        .dynamic_slowmode
        .map(|boxed| *boxed)
        .unwrap_or_default();

    let states = database::list_for_guild(&state.core.db, guild_id)
        .await
        .inspect_err(|e| warn!(error = ?e, %guild_id, "slowmode state read failed"))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error".to_string(),
            )
        })?;

    let mut channels = Vec::with_capacity(states.len());

    for row in states {
        let (authors, volume) = cache::read_counts(
            &state.core.redis,
            guild_id,
            row.channel_id,
            config.window_secs,
        )
        .await
        .unwrap_or_default();

        channels.push(SlowmodeChannelStatus {
            channel_id: row.channel_id.to_string(),
            pre_automation_secs: row.pre_automation_secs,
            last_written_secs: row.last_written_secs,
            authors,
            volume,
            armed: row.is_armed(),
            status: disarm_label(row.disarm_reason.as_deref()),
        });
    }

    debug!(%guild_id, channels = channels.len(), "slowmode status served");

    Ok((
        StatusCode::OK,
        Json(SlowmodeStatusResponse { config, channels }),
    ))
}

/// Registers the dynamic slowmode web routes.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new().route("/guilds/{guild_id}/slowmode/status", get(handle_status))
}
