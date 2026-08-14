use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::state::WebState;
use crate::features::giveaways;
use crate::features::giveaways::web::helpers::{
    build_giveaway_msg, parse_config_id,
};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;
use serde_with::{serde_as, DisplayFromStr};
use serenity::all::{ChannelId, GuildId, ReactionType, UserId};
use std::sync::Arc;
use tracing::{info, warn};

#[serde_as]
#[derive(Serialize)]
pub struct SendGiveawayResponse {
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: u64,
}

pub async fn handle_send_giveaway_message(
    State(state): State<Arc<WebState>>,
    Path((guild_id_str, config_id_str)): Path<(String, String)>,
) -> Result<(StatusCode, Json<SendGiveawayResponse>), (StatusCode, String)> {
    let config_id = parse_config_id(&config_id_str)?;
    let guild_id: u64 = guild_id_str.parse().map_err(|e| {
        warn!(error = ?e, guild_id_str, "Invalid guild_id format");
        (StatusCode::BAD_REQUEST, "Invalid guild ID".to_string())
    })?;

    let record = giveaways::database::fetch_giveaway(&state.core.db, config_id, guild_id).await?;

    let Some(channel_id_i64) = record.channel_id else {
        return Err((
            StatusCode::BAD_REQUEST,
            "Cannot edit a giveaway message that hasn't been sent yet!".to_string(),
        ));
    };

    let channel_id = ChannelId::new(channel_id_i64 as u64);
    let host_user = UserId::from(record.host_id as u64)
        .to_user(&state.serenity_http)
        .await
        .inspect_err(|e| warn!(error = ?e, "Couldn't get user through HTTP"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error.".to_string()))?;

    let gctx = get_guild_ctx(GuildId::from(guild_id), &state.serenity_http)
        .await
        .inspect_err(|e| warn!(error = ?e, "Couldn't get guild ctx"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error.".to_string()))?;

    // Updated: Access format, content, and embed via nested `record.message`
    let custom_msg_opt = build_giveaway_msg(
        record.message.format,
        &record.message.content,
        &record.message.embed,
        &record.prize,
        record.winner_count,
        record.end_time,
        host_user,
        &gctx,
    )?;

    let message_builder = custom_msg_opt.unwrap();
    let message = channel_id
        .send_message(&state.serenity_http, message_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, "Failed to send giveaway message to Discord"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error.".to_string()))?;

    // Auto-apply the 🎉 entry emoji
    let emoji = ReactionType::Unicode("🎉".to_string());
    if let Err(err) = message.react(&state.serenity_http, emoji).await {
        warn!(error = ?err, "Failed applying giveaway reaction emoji");
    }

    let message_id = message.id.get();
    giveaways::database::update_giveaway_message_id(&state.core.db, config_id, message_id as i64)
        .await
        .inspect_err(|e| warn!(error = ?e, "Failed updating message ID in DB"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error.".to_string()))?;

    info!(guild_id = guild_id_str, message_id = message_id, "Giveaway dispatched");

    Ok((
        StatusCode::OK,
        Json(SendGiveawayResponse { message_id }),
    ))
}