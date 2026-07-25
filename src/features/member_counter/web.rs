use crate::core::config::state::WebState;
use crate::features::member_counter::types::CounterChannel;
use axum::{Json, Router};
use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use axum::routing::post;
use tracing::{debug, error, info, warn};

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SetupMemberCounterPayload {
    pub counters: Vec<CounterChannel>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SetupMemberCounterResponse {
    pub counters: Vec<CounterChannel>,
}

pub async fn handle_setup_member_counter(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    payload: Result<Json<SetupMemberCounterPayload>, JsonRejection>,
) -> Result<(StatusCode, Json<SetupMemberCounterResponse>), (StatusCode, String)> {
    let Json(payload) = match payload {
        Ok(p) => p,
        Err(rejection) => {
            // THIS WILL PRINT THE EXACT DESERIALIZATION ERROR TO YOUR RUST TERMINAL!
            error!(error = %rejection, "JSON Deserialization failed");
            return Err((StatusCode::UNPROCESSABLE_ENTITY, rejection.body_text()));
        }
    };

    debug!(guild_id = %guild_id_str, "Received request to setup member counter channels");

    let guild_id_u64 = guild_id_str
        .parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, guild_id_str = %guild_id_str, "Failed to parse guild ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Guild ID format".to_string()))?;
    let guild_id = serenity::GuildId::new(guild_id_u64);

    let mut updated_counters = payload.counters;

    // Check if any counter actually requires a channel to be created
    let needs_creation = updated_counters.iter().any(|c| c.channel_id.is_none());

    if !needs_creation {
        return Ok((
            StatusCode::OK,
            Json(SetupMemberCounterResponse {
                counters: updated_counters,
            }),
        ));
    }

    // Create a category for the counters on Discord
    let category_builder = serenity::CreateChannel::new("📊 Server Stats")
        .kind(serenity::ChannelType::Category);

    info!(guild_id = guild_id_u64, "Creating 'Server Stats' category for member counters");

    let category = guild_id
        .create_channel(&state.http, category_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, guild_id = guild_id_u64, "Failed to create category"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create category: {}", e)))?;

    // Iterate through counters and create voice channels for any missing channel_id
    for counter in updated_counters.iter_mut() {
        if counter.channel_id.is_none() {
            // Render template default count placeholder for initial channel creation
            let channel_name = counter
                .name_template
                .replace("{count}", "0");

            let voice_builder = serenity::CreateChannel::new(&channel_name)
                .kind(serenity::ChannelType::Voice)
                .category(category.id);

            info!(
                guild_id = guild_id_u64,
                channel_name = %channel_name,
                counter_id = %counter.id,
                "Creating voice channel for counter"
            );

            let voice_channel = guild_id
                .create_channel(&state.http, voice_builder)
                .await
                .inspect_err(|e| warn!(error = ?e, guild_id = guild_id_u64, "Failed to create voice channel"))
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create counter channel: {}", e)))?;

            counter.channel_id = Some(voice_channel.id.get());
        }
    }

    info!(
        guild_id = guild_id_u64,
        category_id = %category.id,
        "Member counter category and channels setup successfully completed"
    );

    Ok((
        StatusCode::OK,
        Json(SetupMemberCounterResponse {
            counters: updated_counters,
        }),
    ))
}

pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/guilds/{guild_id}/member-counter/setup", post(handle_setup_member_counter))
}