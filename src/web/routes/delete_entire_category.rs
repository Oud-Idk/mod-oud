use crate::utils::moderation::actions::delete_entire_category;
use crate::WebState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{debug, info, warn};

#[derive(Deserialize)]
pub struct DeleteCategoryPayload {
    pub category_id: String,
}

#[derive(Serialize)]
pub struct DeleteCategoryResponse {
    pub category_id: String,
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
    let category_id_u64 = payload.category_id.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, category_id = payload.category_id, "Failed to parse category ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Category ID format".to_string()))?;

    let guild_id = serenity::GuildId::new(guild_id_u64);
    let category_id = serenity::ChannelId::new(category_id_u64);
    
    let deleted_count = delete_entire_category(&state.http, guild_id, category_id).await
        .inspect_err(|e| warn!(error = ?e, "Failed to delete category through API"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to delete category: {}", e)))?;

    info!(
        guild_id = guild_id_u64,
        category_id = category_id_u64,
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