// Adjust these imports as necessary depending on where your helper functions are located
use crate::core::config::{get_guild_ctx, get_settings, replace_ticket_panel_placeholders};
use crate::types::config::config::Format;
use crate::utils::custom_msg::build_custom_message;
// Assuming get_guild_ctx and replace_ticket_panel_placeholders are in crate::utils::placeholders:
use crate::WebState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize)]
pub struct SendTicketMessagePayload {
    pub channel_id: String,
}

#[derive(Serialize)]
pub struct SendTicketMessageResponse {
    pub message_id: String,
}

pub async fn handle_send_ticket_message(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<SendTicketMessagePayload>,
) -> Result<(StatusCode, Json<SendTicketMessageResponse>), (StatusCode, String)> {
    let guild_id = guild_id_str.parse::<i64>().map_err(|_| {
        (StatusCode::BAD_REQUEST, "Invalid Guild ID format".to_string())
    })?;

    let channel_id_u64 = payload.channel_id.parse::<u64>().map_err(|_| {
        (StatusCode::BAD_REQUEST, "Invalid Channel ID format".to_string())
    })?;

    let redis_conn = state
        .redis_client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to create Redis connection: {}", e),
            )
        })?;

    let settings = get_settings(&state.pool, &redis_conn, guild_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let ticket_cfg = match settings.tickets {
        Some(cfg) => cfg,
        None => {
            return Err((
                StatusCode::BAD_REQUEST,
                "Ticket system is not configured yet.".to_string(),
            ))
        }
    };

    let serenity_guild_id = serenity::GuildId::new(guild_id as u64);

    let gctx = get_guild_ctx(serenity_guild_id, &state.http)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to load guild context: {}", e),
            )
        })?;

    let role_id_opt = ticket_cfg
        .ticket_role_id
        .map(serenity::RoleId::new);

    let mut role_name_opt = None;
    if let Some(role_id) = role_id_opt {
        if let Ok(roles) = serenity_guild_id.roles(&state.http).await {
            if let Some(role) = roles.get(&role_id) {
                role_name_opt = Some(role.name.clone());
            }
        }
    }

    let channel = serenity::ChannelId::new(channel_id_u64);
    let is_embed = matches!(ticket_cfg.format, Format::Embed);

    let custom_msg_opt = build_custom_message(
        is_embed,
        ticket_cfg.content.as_ref(),
        ticket_cfg.embed.as_ref(),
        |text| {
            replace_ticket_panel_placeholders(
                text,
                &gctx,
                role_id_opt,
                role_name_opt.as_deref(),
            )
        },
    )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to construct custom message layout: {}", e),
            )
        })?;

    let mut message_builder = custom_msg_opt.unwrap_or_else(|| {
        let default_embed = serenity::CreateEmbed::default()
            .title("Support Tickets")
            .description("Click the button below to open a support ticket. Our staff will assist you shortly.".to_string())
            .color(0x5865F2);

        serenity::CreateMessage::default().embed(default_embed)
    });

    let components = vec![serenity::CreateActionRow::Buttons(vec![
        serenity::CreateButton::new("open_ticket")
            .label("Open Ticket")
            .style(serenity::ButtonStyle::Primary)
            .emoji('🎫'),
    ])];

    message_builder = message_builder.components(components);

    let message = channel
        .send_message(&state.http, message_builder)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to send Discord message: {}", e),
            )
        })?;

    let response = SendTicketMessageResponse {
        message_id: message.id.to_string(),
    };

    Ok((StatusCode::OK, Json(response)))
}