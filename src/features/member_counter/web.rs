use crate::core::config::settings::{get_settings, save_settings};
use crate::core::config::state::WebState;
use crate::features::member_counter::types::CounterChannel;
use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use serenity::all::GuildId;
use std::sync::Arc;
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
    Path(guild_id): Path<GuildId>,
    payload: Result<Json<SetupMemberCounterPayload>, JsonRejection>,
) -> Result<(StatusCode, Json<SetupMemberCounterResponse>), (StatusCode, String)> {
    let Json(payload) = match payload {
        Ok(p) => p,
        Err(rejection) => {
            debug!(error = %rejection, "rejected member counter setup; the body did not deserialize");
            return Err((StatusCode::UNPROCESSABLE_ENTITY, rejection.body_text()));
        }
    };

    let mut counters = payload.counters;

    // Fast-path: Return early if no channels need to be created
    if !counters.iter().any(|c| c.channel_id.is_none()) {
        return Ok((
            StatusCode::OK,
            Json(SetupMemberCounterResponse { counters }),
        ));
    }

    let category_id = get_or_create_counter_category(&state, guild_id).await?;
    create_missing_counter_channels(&state, guild_id, category_id, &mut counters).await?;

    info!(
        %guild_id,
        category_id = %category_id.get(),
        "member counter category and channels created"
    );

    Ok((
        StatusCode::OK,
        Json(SetupMemberCounterResponse { counters }),
    ))
}

/// Resolves an existing category or creates a new one and saves it to settings.
async fn get_or_create_counter_category(
    state: &Arc<WebState>,
    guild_id: GuildId,
) -> Result<serenity::ChannelId, (StatusCode, String)> {
    let mut guild_settings = get_settings(
        &state.core.db,
        &state.core.redis,
        &state.core.guild_configs_cache,
        guild_id,
    )
    .await
    .inspect_err(|e| warn!(error = ?e, %guild_id, "guild settings lookup failed"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error".to_string(),
        )
    })?;

    // Check if the saved category ID is still valid in Discord
    if let Some(saved_id) = guild_settings
        .member_counter
        .as_ref()
        .and_then(|c| c.category_id)
    {
        match state.serenity_http.get_channel(saved_id).await {
            Ok(serenity::Channel::Guild(channel))
                if channel.kind == serenity::ChannelType::Category =>
            {
                debug!(category_id = saved_id.get(), "reusing existing category");
                return Ok(saved_id);
            }
            Ok(_) => {
                warn!(%guild_id, channel_id = %saved_id, "saved category id is not a category");
            }
            Err(e) => {
                warn!(error = ?e, %guild_id, channel_id = %saved_id, "saved category id no longer exists on discord");
            }
        }
    }

    // Category is missing or invalid -> Create a new one
    let category_builder =
        serenity::CreateChannel::new("Server Stats").kind(serenity::ChannelType::Category);

    let category = guild_id
        .create_channel(&state.serenity_http, category_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, %guild_id, "member counter category not created"))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error".to_string(),
            )
        })?;

    info!(%guild_id, channel_id = %category.id, "member counter category created");

    guild_settings
        .member_counter
        .get_or_insert_with(Default::default)
        .category_id = Some(category.id);

    save_settings(
        &state.core.db,
        &state.core.redis,
        &state.core.guild_configs_cache,
        guild_id,
        &guild_settings,
    )
    .await
    .inspect_err(|e| error!(error = %e, %guild_id, "guild settings save failed"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error".to_string(),
        )
    })?;

    Ok(category.id)
}

/// Creates Discord voice channels for any counters missing a `channel_id`.
async fn create_missing_counter_channels(
    state: &Arc<WebState>,
    guild_id: GuildId,
    category_id: serenity::ChannelId,
    counters: &mut [CounterChannel],
) -> Result<(), (StatusCode, String)> {
    for counter in counters.iter_mut() {
        if counter.channel_id.is_none() {
            let channel_name = counter.name_template.replace("{count}", "0");

            let voice_builder = serenity::CreateChannel::new(&channel_name)
                .kind(serenity::ChannelType::Voice)
                .category(category_id);

            let voice_channel = guild_id
                .create_channel(&state.serenity_http, voice_builder)
                .await
                .inspect_err(|e| warn!(error = ?e, %guild_id, "counter voice channel not created"))
                .map_err(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Internal server error".to_string(),
                    )
                })?;

            info!(
                %guild_id,
                channel_id = %voice_channel.id,
                channel_name = %channel_name,
                counter_id = %counter.id,
                "counter voice channel created"
            );

            counter.channel_id = Some(voice_channel.id);
        }
    }

    Ok(())
}

/// Registers the member counter web route for setting up counter channels.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new().route(
        "/guilds/{guild_id}/member-counter/setup",
        post(handle_setup_member_counter),
    )
}
