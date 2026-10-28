use crate::core::config::settings::get_settings;
use crate::core::config::state::WebState;
use crate::features::raid_detection::implementation::DynamicRaidDetector;
use crate::features::raid_detection::types::{RaidDetectionConfig, RaidStatsSnapshot};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use chrono::Utc;
use poise::serenity_prelude as serenity;
use serde::Serialize;
use std::sync::Arc;
use tracing::{debug, warn};

/// Read-only. Returns the guild's configured detection settings alongside the live stats.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RaidStatsResponse {
    #[serde(flatten)]
    pub stats: RaidStatsSnapshot,
    pub config: RaidDetectionConfig,
}

/// Returns the current raid detection baseline for a guild.
///
/// The dashboard reads this instead of recomputing the threshold, so the numbers on screen
/// are the same ones the bot enforces.
pub async fn handle_raid_stats(
    State(state): State<Arc<WebState>>,
    Path(guild_id): Path<serenity::GuildId>,
) -> Result<(StatusCode, Json<RaidStatsResponse>), (StatusCode, String)> {
    let settings = get_settings(
        &state.core.db,
        &state.core.redis,
        &state.core.guild_configs_cache,
        guild_id,
    )
    .await
    .inspect_err(|e| warn!(error = ?e, %guild_id, "raid stats settings lookup failed"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal Server Error".to_string(),
        )
    })?;

    // Unconfigured is not the same as unmeasured: fall back to the documented defaults so a
    // guild that has never saved the feature still gets a real reading.
    let config = settings
        .raid_detection
        .map(|boxed| *boxed)
        .unwrap_or_default();

    let detector = DynamicRaidDetector::new(
        state.core.redis.clone(),
        config.window_size_seconds,
        config.z_score_multiplier,
        config.min_safe_limit,
    );

    let snapshot = detector
        .current_stats(guild_id, Utc::now())
        .await
        .inspect_err(|e| warn!(error = ?e, %guild_id, "raid stats read failed"))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error".to_string(),
            )
        })?;

    debug!(
        %guild_id,
        threshold = snapshot.calculated_threshold,
        stats_available = snapshot.stats_available,
        "raid stats served to the dashboard"
    );

    Ok((
        StatusCode::OK,
        Json(RaidStatsResponse {
            stats: snapshot,
            config,
        }),
    ))
}

/// Registers the raid detection web routes.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new().route(
        "/guilds/{guild_id}/raid-detection/stats",
        get(handle_raid_stats),
    )
}
