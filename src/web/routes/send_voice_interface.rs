use crate::shared::embed::build_custom_message;
use crate::types::config::config::Format;
use crate::types::embed::DiscordEmbed;
use crate::web::helpers::embed;
use crate::web::helpers::embed::EmbedGetters;
use crate::WebState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use serenity::all::CreateButton;
use std::sync::Arc;
use tracing::{debug, info, warn};

#[derive(Deserialize)]
pub struct SendTempVoiceInterfacePayload {
    pub channel_id: String,
    pub content: Option<String>,
    pub embed: Option<DiscordEmbed>,
    pub format: Option<Format>,
}

impl EmbedGetters for SendTempVoiceInterfacePayload {
    fn content(&self) -> Option<&str> {
        self.content.as_deref()
    }
    fn embed(&self) -> Option<&DiscordEmbed> {
        self.embed.as_ref()
    }
    fn format(&self) -> Option<&Format> { self.format.as_ref() }
}

#[derive(Serialize)]
pub struct SendTempVoiceInterfaceResponse {
    pub message_id: String,
}

pub async fn handle_send_temp_voice_interface(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<SendTempVoiceInterfacePayload>,
) -> Result<(StatusCode, Json<SendTempVoiceInterfaceResponse>), (StatusCode, String)> {
    debug!(guild_id = guild_id_str, "Received request to dispatch generic embed");

    let channel_id_u64 = payload.channel_id.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, channel_id = payload.channel_id, "Failed to parse channel ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Channel ID format".to_string()))?;

    let target_channel = serenity::ChannelId::new(channel_id_u64);

    let rename_btn = CreateButton::new("temp_voice_rename")
        .style(serenity::ButtonStyle::Secondary)
        .label("Rename");

    let limit_btn = CreateButton::new("temp_voice_limit")
        .style(serenity::ButtonStyle::Secondary)
        .label("Limit");

    let kick_btn = CreateButton::new("temp_voice_kick")
        .style(serenity::ButtonStyle::Secondary)
        .label("Kick");

    let lock_btn = CreateButton::new("temp_voice_lock")
        .style(serenity::ButtonStyle::Secondary)
        .label("Lock");

    let unlock_btn = CreateButton::new("temp_voice_unlock")
        .style(serenity::ButtonStyle::Secondary)
        .label("Unlock");

    let trust_btn = CreateButton::new("temp_voice_trust")
        .style(serenity::ButtonStyle::Secondary)
        .label("Trust");

    let untrust_btn = CreateButton::new("temp_voice_untrust")
        .style(serenity::ButtonStyle::Secondary)
        .label("Untrust");

    let block_btn = CreateButton::new("temp_voice_block")
        .style(serenity::ButtonStyle::Secondary)
        .label("Block");

    let unblock_btn = CreateButton::new("temp_voice_unblock")
        .style(serenity::ButtonStyle::Secondary)
        .label("Unblock");

    let delete_btn = CreateButton::new("temp_voice_delete")
        .style(serenity::ButtonStyle::Secondary)
        .label("Delete");

    let transfer_btn = CreateButton::new("temp_voice_transfer")
        .style(serenity::ButtonStyle::Secondary)
        .label("Transfer Ownership");


    let channel_row = serenity::CreateActionRow::Buttons(vec![
        rename_btn,
        limit_btn,
        lock_btn,
        unlock_btn,
    ]);

    let user_row = serenity::CreateActionRow::Buttons(vec![
        trust_btn,
        untrust_btn,
        kick_btn,
        block_btn,
        unblock_btn
    ]);

    let action_row = serenity::CreateActionRow::Buttons(vec![
        delete_btn,
        transfer_btn,
    ]);

    let message_builder = match embed::create_embed_for_web(&payload, None::<fn(&str) -> String>) {
        Ok(value) => value,
        Err(e) => return Err(e),
    }
        .components(vec![channel_row, user_row, action_row]);


    let message = target_channel
        .send_message(&state.http, message_builder)
        .await
        .inspect_err(|e| warn!(error = ?e, channel_id = channel_id_u64, "Failed to deliver interface"))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Discord API error: {}", e)))?;

    info!(
        channel_id = channel_id_u64,
        message_id = %message.id,
        "Interface successfully delivered"
    );

    Ok((
        StatusCode::OK,
        Json(SendTempVoiceInterfaceResponse {
            message_id: message.id.to_string(),
        }),
    ))
}

