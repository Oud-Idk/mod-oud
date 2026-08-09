use crate::core::config::state::WebState;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use serde_with::{serde_as, DisplayFromStr};
use tracing::{debug, info, warn};

#[derive(Deserialize)]
pub struct CreateTempHubPayload {
    pub category_name: String,
    pub hub_channel_name: String,
}

#[serde_as]
#[derive(Serialize)]
pub struct CreateTempHubResponse {
    #[serde_as(as = "DisplayFromStr")]
    pub category_id: u64,
    #[serde_as(as = "DisplayFromStr")]
    pub hub_channel_id: u64,
    #[serde_as(as = "DisplayFromStr")]
    pub interface_channel_id: u64,
}

/// Handler to spin up a temporary category and its main "hub" voice channel.
pub async fn handle_create_temp_category_and_hub(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<CreateTempHubPayload>,
) -> Result<(StatusCode, Json<CreateTempHubResponse>), (StatusCode, String)> {
    debug!(guild_id = guild_id_str, "Received request to create temp category and voice hub");

    let guild_id_u64 = guild_id_str.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, guild_id_str = guild_id_str, "Failed to parse guild ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Guild ID format".to_string()))?;
    let guild_id = serenity::all::GuildId::new(guild_id_u64);

    let category_builder = serenity::all::CreateChannel::new(&payload.category_name)
        .kind(serenity::all::ChannelType::Category);

    info!(guild_id = guild_id_u64, name = %payload.category_name, "Creating temporary category");

    let category = guild_id
        .create_channel(&state.http, category_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, guild_id = guild_id_u64, "Failed to create category"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error.".to_string()))?;

    let interface_builder = serenity::all::CreateChannel::new("Interface")
        .kind(serenity::all::ChannelType::Text)
        .category(&category);

    let interface_channel = guild_id
        .create_channel(&state.http, interface_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, guild_id = guild_id_u64, "Failed to create interface channel"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error.".to_string()))?;

    info!(
        guild_id = guild_id_u64,
        channel_id = interface_channel.id.get(),
        "Created interface channel."
    );

    let voice_builder = serenity::all::CreateChannel::new(&payload.hub_channel_name)
        .kind(serenity::all::ChannelType::Voice)
        .category(category.id);

    let voice_channel = guild_id
        .create_channel(&state.http, voice_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, guild_id = guild_id_u64, "Failed to create voice hub channel"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error.".to_string()))?;

    info!(
        guild_id = guild_id_u64,
        category_id = %category.id,
        interface_channel_id = %interface_channel.id.get(),
        voice_channel_id = %voice_channel.id,
        "Temp category and voice hub successfully created"
    );

    Ok((
        StatusCode::CREATED,
        Json(CreateTempHubResponse {
            category_id: category.id.get(),
            hub_channel_id: voice_channel.id.get(),
            interface_channel_id: interface_channel.id.get(),
        }),
    ))
}