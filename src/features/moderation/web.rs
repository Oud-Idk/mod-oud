use crate::core::config::state::WebState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::{Json, Router};
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use axum::routing::delete;
use tracing::{debug, info, warn};
use serde_with::{serde_as, DisplayFromStr};
use crate::features::moderation::channels::delete_entire_category;

#[serde_as]
#[derive(Deserialize)]
pub struct DeleteCategoryPayload {
    #[serde_as(as = "DisplayFromStr")]
    pub category_id: u64,
}

#[serde_as]
#[derive(Serialize)]
pub struct DeleteCategoryResponse {
    #[serde_as(as = "DisplayFromStr")]
    pub category_id: u64,
    pub deleted_children_count: usize,
}

pub async fn handle_delete_entire_category(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<DeleteCategoryPayload>,
) -> Result<(StatusCode, Json<DeleteCategoryResponse>), (StatusCode, String)> {
    debug!(guild_id = guild_id_str, category_id = payload.category_id, "Request to delete category and children via API");

    // Parse IDs
    let guild_id_u64 = guild_id_str.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, guild_id_str = guild_id_str, "Failed to parse guild ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Guild ID format".to_string()))?;

    let guild_id = serenity::GuildId::new(guild_id_u64);
    let category_id = serenity::ChannelId::new(payload.category_id);

    let deleted_count = delete_entire_category(&state.serenity_http, guild_id, category_id).await
        .inspect_err(|e| warn!(error = ?e, "Failed to delete category through API"))
        .map_err(|_e| (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error".to_string()))?;

    info!(
        %guild_id,
        category_id = payload.category_id,
        deleted_children = deleted_count,
        "Successfully deleted category and nested channels via API"
    );

    Ok((
        StatusCode::OK,
        Json(DeleteCategoryResponse {
            category_id: payload.category_id,
            deleted_children_count: deleted_count,
        }),
    ))
}

/// Returns the moderation feature's HTTP routes.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/guilds/{guild_id}/category/delete-entire", delete(handle_delete_entire_category))
}