use crate::core::config::state::WebState;
use crate::shared::embed;
use crate::shared::embed::DiscordEmbed;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::CreateButton;
use std::sync::Arc;
use tracing::{debug, info, warn};

#[serde_as]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendTempVoiceInterfacePayload {
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: u64,
    pub embed_state: DiscordEmbed,
}

#[serde_as]
#[derive(Serialize)]
pub struct SendTempVoiceInterfaceResponse {
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: u64,
}

#[allow(clippy::similar_names)]
pub async fn handle_send_temp_voice_interface(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<SendTempVoiceInterfacePayload>,
) -> Result<(StatusCode, Json<SendTempVoiceInterfaceResponse>), (StatusCode, String)> {
    debug!(
        guild_id = guild_id_str,
        "Received request to dispatch generic embed"
    );

    let target_channel = serenity::all::ChannelId::new(payload.channel_id);

    let rename_btn = CreateButton::new("temp_voice_rename")
        .style(serenity::all::ButtonStyle::Secondary)
        .label("Rename");
    let limit_btn = CreateButton::new("temp_voice_limit")
        .style(serenity::all::ButtonStyle::Secondary)
        .label("Limit");
    let kick_btn = CreateButton::new("temp_voice_kick")
        .style(serenity::all::ButtonStyle::Secondary)
        .label("Kick");
    let lock_btn = CreateButton::new("temp_voice_lock")
        .style(serenity::all::ButtonStyle::Secondary)
        .label("Lock");
    let unlock_btn = CreateButton::new("temp_voice_unlock")
        .style(serenity::all::ButtonStyle::Secondary)
        .label("Unlock");
    let trust_btn = CreateButton::new("temp_voice_trust")
        .style(serenity::all::ButtonStyle::Secondary)
        .label("Trust");
    let untrust_btn = CreateButton::new("temp_voice_untrust")
        .style(serenity::all::ButtonStyle::Secondary)
        .label("Untrust");
    let block_btn = CreateButton::new("temp_voice_block")
        .style(serenity::all::ButtonStyle::Secondary)
        .label("Block");
    let unblock_btn = CreateButton::new("temp_voice_unblock")
        .style(serenity::all::ButtonStyle::Secondary)
        .label("Unblock");
    let delete_btn = CreateButton::new("temp_voice_delete")
        .style(serenity::all::ButtonStyle::Secondary)
        .label("Delete");
    let transfer_btn = CreateButton::new("temp_voice_transfer")
        .style(serenity::all::ButtonStyle::Secondary)
        .label("Transfer Ownership");

    let channel_row =
        serenity::all::CreateActionRow::Buttons(vec![rename_btn, limit_btn, lock_btn, unlock_btn]);

    let user_row = serenity::all::CreateActionRow::Buttons(vec![
        trust_btn,
        untrust_btn,
        kick_btn,
        block_btn,
        unblock_btn,
    ]);

    let action_row = serenity::all::CreateActionRow::Buttons(vec![delete_btn, transfer_btn]);

    let message_builder =
        match embed::create_embed_for_web(&payload.embed_state, std::string::ToString::to_string) {
            Ok(value) => value,
            Err(e) => return Err(e),
        }
        .components(vec![channel_row, user_row, action_row]);

    let message = target_channel
        .send_message(&state.serenity_http, message_builder)
        .await
        .inspect_err(
            |e| warn!(error = ?e, channel_id = payload.channel_id, "Failed to deliver interface"),
        )
        .map_err(|_e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error.".to_string(),
            )
        })?;

    info!(
        channel_id = payload.channel_id,
        message_id = %message.id,
        "Interface successfully delivered"
    );

    Ok((
        StatusCode::OK,
        Json(SendTempVoiceInterfaceResponse {
            message_id: message.id.get(),
        }),
    ))
}
