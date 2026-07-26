use crate::core::config::state::WebState;
use crate::features::giveaways::web::helpers::{build_giveaway_msg, convert_create_to_edit_message, parse_config_id};
use crate::features::giveaways::web::send::SendGiveawayResponse;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serenity::all::{ChannelId, MessageId};
use std::sync::Arc;
use tracing::warn;
use crate::features::giveaways;

// 2. EDIT DISCORD GIVEAWAY MESSAGE
pub async fn handle_edit_giveaway_message(
    State(state): State<Arc<WebState>>,
    Path((guild_id_str, config_id_str)): Path<(String, String)>,
) -> Result<(StatusCode, Json<SendGiveawayResponse>), (StatusCode, String)> {
    let config_id = parse_config_id(&config_id_str)?;
    let record = giveaways::database::fetch_giveaway(&state.db, config_id, &guild_id_str).await?;

    let Some(message_id_i64) = record.message_id else {
        return Err((StatusCode::BAD_REQUEST, "Cannot edit a giveaway message that hasn't been sent yet!".to_string()));
    };

    let Some(channel_id_i64) = record.channel_id else {
        return Err((StatusCode::BAD_REQUEST, "Cannot edit a giveaway message that hasn't been sent yet".to_string()));
    };

    let channel_id = ChannelId::new(channel_id_i64 as u64);
    let message_id = MessageId::new(message_id_i64 as u64);
    let end_timestamp = record.end_time.timestamp().to_string();

    let custom_msg_opt = build_giveaway_msg(
        &record.format,
        record.content.as_deref(),
        record.embed.as_deref(),
        &record.prize,
        record.winner_count,
        &end_timestamp,
    )?;

    let edit_builder = convert_create_to_edit_message(custom_msg_opt);

    channel_id
        .edit_message(&state.http, message_id, edit_builder)
        .await
        .map_err(|e| {
            warn!(error = ?e, "Failed to edit Discord giveaway message");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed editing giveaway message: {}", e))
        })?;

    Ok((
        StatusCode::OK,
        Json(SendGiveawayResponse {
            message_id: message_id_i64 as u64,
        }),
    ))
}