use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::state::WebState;
use crate::features::giveaways;
use crate::features::giveaways::web::helpers::{
    build_giveaway_msg, convert_create_to_edit_message, parse_config_id,
};
use crate::features::giveaways::web::send::SendGiveawayResponse;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serenity::all::{ChannelId, GuildId, MessageId, UserId};
use std::sync::Arc;
use tracing::warn;

pub async fn handle_edit_giveaway_message(
    State(state): State<Arc<WebState>>,
    Path((guild_id_str, config_id_str)): Path<(String, String)>,
) -> Result<(StatusCode, Json<SendGiveawayResponse>), (StatusCode, String)> {
    let config_id = parse_config_id(&config_id_str)?;
    let guild_id: u64 = guild_id_str.parse().map_err(|e| {
        warn!(error = ?e, guild_id_str, "Invalid guild_id format");
        (StatusCode::BAD_REQUEST, "Invalid guild ID".to_string())
    })?;
    let record = giveaways::database::fetch_giveaway(&state.core.db, config_id, guild_id).await?;

    let Some(message_id_u64) = record.message_id.map(i64::cast_unsigned) else {
        return Err((
            StatusCode::BAD_REQUEST,
            "Cannot edit a giveaway message that hasn't been sent yet!".to_string(),
        ));
    };

    let Some(channel_id_u64) = record.channel_id.map(i64::cast_unsigned) else {
        return Err((
            StatusCode::BAD_REQUEST,
            "Cannot edit a giveaway message that hasn't been sent yet".to_string(),
        ));
    };

    let channel_id = ChannelId::new(channel_id_u64);
    let message_id = MessageId::new(message_id_u64);

    let host_user = UserId::from(record.host_id.cast_unsigned())
        .to_user(&state.serenity_http)
        .await
        .inspect_err(|e| warn!(error = ?e, "Couldn't get user through HTTP"))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error.".to_string(),
            )
        })?;
    let gctx = get_guild_ctx(GuildId::from(guild_id), &state.serenity_http)
        .await
        .inspect_err(|e| warn!(error = ?e, "Couldn't get guild ctx"))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error.".to_string(),
            )
        })?;

    let custom_msg_opt = build_giveaway_msg(
        &record.message,
        &record.prize,
        record.winner_count,
        record.end_time,
        &host_user,
        &gctx,
    )?;

    let edit_builder = convert_create_to_edit_message(custom_msg_opt);

    channel_id
        .edit_message(&state.serenity_http, message_id, edit_builder)
        .await
        .map_err(|e| {
            warn!(error = ?e, "Failed to edit Discord giveaway message");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error".to_string(),
            )
        })?;

    Ok((
        StatusCode::OK,
        Json(SendGiveawayResponse {
            message_id: message_id_u64,
        }),
    ))
}
