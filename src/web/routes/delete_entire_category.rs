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

/// Handler to delete a category and all of its nested channels.
pub async fn handle_delete_entire_category(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<DeleteCategoryPayload>,
) -> Result<(StatusCode, Json<DeleteCategoryResponse>), (StatusCode, String)> {
    debug!(guild_id = guild_id_str, category_id = payload.category_id, "Request to delete category and children");

    // Parse IDs
    let guild_id_u64 = guild_id_str.parse::<u64>().map_err(|_| {
        (StatusCode::BAD_REQUEST, "Invalid Guild ID format".to_string())
    })?;
    let category_id_u64 = payload.category_id.parse::<u64>().map_err(|_| {
        (StatusCode::BAD_REQUEST, "Invalid Category ID format".to_string())
    })?;

    let guild_id = serenity::GuildId::new(guild_id_u64);
    let category_id = serenity::ChannelId::new(category_id_u64);

    let channels = guild_id.channels(&state.http).await.map_err(|e| {
        warn!(error = ?e, guild_id = guild_id_u64, "Failed to fetch guild channels");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to retrieve guild channels: {}", e),
        )
    })?;

    let child_channels: Vec<serenity::ChannelId> = channels
        .values()
        .filter(|channel| channel.parent_id == Some(category_id))
        .map(|channel| channel.id)
        .collect();

    info!(
        guild_id = guild_id_u64,
        category_id = category_id_u64,
        count = child_channels.len(),
        "Found child channels to delete"
    );

    let mut deleted_count = 0;
    for channel_id in &child_channels {
        match channel_id.delete(&state.http).await {
            Ok(_) => {
                deleted_count += 1;
            }
            Err(e) => {
                warn!(
                    error = ?e,
                    channel_id = %channel_id,
                    "Failed to delete child channel inside category"
                );
            }
        }
    }

    category_id.delete(&state.http).await.map_err(|e| {
        warn!(error = ?e, category_id = category_id_u64, "Failed to delete the category channel");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete the category channel: {}", e),
        )
    })?;

    info!(
        guild_id = guild_id_u64,
        category_id = category_id_u64,
        deleted_children = deleted_count,
        "Successfully deleted category and nested channels"
    );

    Ok((
        StatusCode::OK,
        Json(DeleteCategoryResponse {
            category_id: payload.category_id,
            deleted_children_count: deleted_count,
        }),
    ))
}