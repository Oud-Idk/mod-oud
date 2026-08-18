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
use serenity::all::{ChannelId, GuildId};
use tracing::{debug, error, info, warn};
use crate::core::config::settings::{get_settings, save_settings};

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
    Path(guild_id): Path<GuildId>,
    payload: Result<Json<SetupMemberCounterPayload>, JsonRejection>,
) -> Result<(StatusCode, Json<SetupMemberCounterResponse>), (StatusCode, String)> {
    let Json(payload) = match payload {
        Ok(p) => p,
        Err(rejection) => {
            error!(error = %rejection, "JSON Deserialization failed");
            return Err((StatusCode::UNPROCESSABLE_ENTITY, rejection.body_text()));
        }
    };

    debug!(%guild_id, "Received request to setup member counter channels");

    let mut updated_counters = payload.counters;

    let needs_creation = updated_counters.iter().any(|c| c.channel_id.is_none());

    if !needs_creation {
        return Ok((
            StatusCode::OK,
            Json(SetupMemberCounterResponse {
                counters: updated_counters,
            }),
        ));
    }

    let mut guild_settings = get_settings(&state.core.db, &state.core.redis, &state.core.guild_configs_cache, guild_id).await
        .inspect_err(|e| warn!(error = ?e, %guild_id, "Failed to get settings"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string()))?;

    let mut verified_category_id = None;

    if let Some(saved_id) = guild_settings.member_counter.as_ref().and_then(|c| c.category_id) {
        match state.serenity_http.get_channel(saved_id).await {
            Ok(serenity::Channel::Guild(channel)) if channel.kind == serenity::ChannelType::Category => {
                verified_category_id = Some(saved_id);
            }
            Ok(_) => {
                warn!(%guild_id, channel_id = %saved_id, "Saved category ID is not a category, recreating...");
            }
            Err(e) => {
                warn!(error = ?e, %guild_id, channel_id = %saved_id, "Saved category ID no longer exists in Discord, recreating...");
            }
        }
    }

    let category_id = if let Some(valid_id) = verified_category_id { valid_id } else {
        let category_builder = serenity::CreateChannel::new("📊 Server Stats")
            .kind(serenity::ChannelType::Category);

        info!(%guild_id, "Creating 'Server Stats' category for member counters");

        let category = guild_id
            .create_channel(&state.serenity_http, category_builder)
            .await
            .inspect_err(|e| warn!(error = ?e, %guild_id, "Failed to create category"))
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string()))?;

        guild_settings.member_counter
            .get_or_insert_with(Default::default)
            .category_id = Some(category.id);

        save_settings(&state.core.db, &state.core.redis, &state.core.guild_configs_cache, guild_id, &guild_settings).await
            .inspect_err(|e| warn!(error = ?e, %guild_id, "Failed to save settings"))
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string()))?;

        category.id
    };

    debug!(category_id = category_id.get(), "Got category for member tracking");

    for counter in &mut updated_counters {
        if counter.channel_id.is_none() {
            let channel_name = counter
                .name_template
                .replace("{count}", "0");

            let voice_builder = serenity::CreateChannel::new(&channel_name)
                .kind(serenity::ChannelType::Voice)
                .category(category_id);

            info!(
                %guild_id,
                channel_name = %channel_name,
                counter_id = %counter.id,
                "Creating voice channel for counter"
            );

            let voice_channel = guild_id
                .create_channel(&state.serenity_http, voice_builder)
                .await
                .inspect_err(|e| warn!(error = ?e, %guild_id, "Failed to create voice channel"))
                .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string()))?;

            counter.channel_id = Some(voice_channel.id);
        }
    }

    info!(
        %guild_id,
        category_id = %category_id.get(),
        "Member counter category and channels setup successfully completed"
    );

    Ok((
        StatusCode::OK,
        Json(SetupMemberCounterResponse {
            counters: updated_counters,
        }),
    ))
}

/// Registers the member counter web route for setting up counter channels.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/guilds/{guild_id}/member-counter/setup", post(handle_setup_member_counter))
}