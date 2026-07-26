use crate::core::config::state::WebState;
use crate::features::giveaways;
use crate::features::giveaways::web::helpers::{
    build_giveaway_msg, convert_create_to_edit_message, parse_config_id,
};
use crate::shared::error::is_unknown_message_error;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Serialize;
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{ChannelId, GuildId, MessageId, ReactionType, UserId};
use std::sync::Arc;
use tracing::{debug, error, info, warn};
use crate::core::config::guild_ctx::get_guild_ctx;

#[serde_as]
#[derive(Serialize)]
pub struct SendGiveawayResponse {
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: u64,
}

// 1. SEND DISCORD GIVEAWAY MESSAGE
pub async fn handle_send_giveaway_message(
    State(state): State<Arc<WebState>>,
    Path((guild_id_str, config_id_str)): Path<(String, String)>,
) -> Result<(StatusCode, Json<SendGiveawayResponse>), (StatusCode, String)> {
    let config_id = parse_config_id(&config_id_str)?;
    let guild_id: i64 = guild_id_str.parse().map_err(|e| {
        warn!(error = ?e, guild_id_str, "Invalid guild_id format");
        (StatusCode::BAD_REQUEST, "Invalid guild ID".to_string())
    })?;

    let record = giveaways::database::fetch_giveaway(&state.db, config_id, guild_id).await?;

    let Some(channel_id_i64) = record.channel_id else {
        return Err((StatusCode::BAD_REQUEST, "Cannot edit a giveaway message that hasn't been sent yet!".to_string()));
    };

    let channel_id = ChannelId::new(channel_id_i64 as u64);
    let host_user = UserId::from(record.host_id as u64).to_user(&state.http).await
        .inspect_err(|e| warn!(error = ?e, "Couldn't get user through HTTP"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't fetch user.".to_string()))?;
    let gctx = get_guild_ctx(GuildId::from(guild_id as u64), &state.http).await
        .inspect_err(|e| warn!(error = ?e, "Couldn't get guild ctx"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't fetch guild ctx.".to_string()))?;

    let custom_msg_opt = build_giveaway_msg(
        &record.format,
        record.content.as_deref(),
        record.embed.as_deref(),
        &record.prize,
        record.winner_count,
        record.end_time,
        host_user,
        &gctx,
    )?;

    let message_builder = custom_msg_opt.unwrap();
    let message = channel_id
        .send_message(&state.http, message_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, "Failed to send giveaway message to Discord"))
        .map_err(|_| { (StatusCode::INTERNAL_SERVER_ERROR, "Failed sending giveaway message.".to_string()) })?;

    // Auto-apply the 🎉 entry emoji
    let emoji = ReactionType::Unicode("🎉".to_string());
    if let Err(err) = message.react(&state.http, emoji).await {
        warn!(error = ?err, "Failed applying giveaway reaction emoji");
    }

    let message_id = message.id.get();
    giveaways::database::update_giveaway_message_id(&state.db, config_id, message_id as i64).await
        .inspect_err(|e| warn!(error = ?e, "Failed updating message ID in DB"))
        .map_err(|_| { (StatusCode::INTERNAL_SERVER_ERROR, "Failed updating message ID in DB.".to_string()) })?;

    info!(guild_id = guild_id_str, message_id = message_id, "Giveaway dispatched");

    Ok((
        StatusCode::OK,
        Json(SendGiveawayResponse { message_id }),
    ))
}

