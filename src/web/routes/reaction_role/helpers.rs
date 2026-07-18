use crate::types::config::config::Format;
use crate::web::routes::reaction_role::database;
use crate::web::routes::reaction_role::database::fetch_active_reactions;
use crate::web::routes::reaction_role::types::{ButtonStyle, ReactionMessage};
use crate::WebState;
use axum::http::StatusCode;
use serenity::all::{ChannelId, CreateButton, MessageId};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::warn;

pub fn parse_config_id(config_id_str: &str) -> Result<i64, (StatusCode, String)> {
    config_id_str.parse::<i64>().map_err(|_| {
        (StatusCode::BAD_REQUEST, "Invalid Configuration ID format".to_string())
    })
}

/// Fetches buttons and builds their Serenity layout elements
pub async fn fetch_and_build_buttons(
    pool: &PgPool,
    reaction_message_id: i64,
) -> Result<Vec<CreateButton>, (StatusCode, String)> {
    let buttons = database::fetch_buttons(pool, reaction_message_id).await?;

    let mut button_components = Vec::new();
    for b in buttons {
        let mut btn = CreateButton::new(b.custom_id.to_string()).style(match b.style {
            ButtonStyle::Secondary => serenity::all::ButtonStyle::Secondary,
            ButtonStyle::Success => serenity::all::ButtonStyle::Success,
            ButtonStyle::Danger => serenity::all::ButtonStyle::Danger,
            ButtonStyle::Primary => serenity::all::ButtonStyle::Primary,
        });

        if let Some(lbl) = b.label {
            if !lbl.trim().is_empty() {
                btn = btn.label(lbl);
            }
        }

        if let Some(emoji_str) = b.emoji {
            if !emoji_str.trim().is_empty() {
                if let Ok(emoji) = emoji_str.parse::<serenity::all::ReactionType>() {
                    btn = btn.emoji(emoji);
                }
            }
        }

        button_components.push(btn);
    }

    Ok(button_components)
}

/// Compiles a custom layout configuration to a Serenity CreateMessage builder
pub fn build_custom_msg(
    format: &Format,
    content: Option<&str>,
    embed_str: Option<&str>,
) -> Result<Option<serenity::all::CreateMessage>, (StatusCode, String)> {
    let embed_data: Option<crate::types::embed::DiscordEmbed> = embed_str
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| {
            serde_json::from_str(s)
                .map_err(|err| {
                    warn!(error = ?err, "Failed to parse stored JSON layout string");
                    err
                })
                .ok()
        });

    let is_embed = matches!(format, Format::Embed);
    crate::utils::custom_msg::build_custom_message(
        is_embed,
        content,
        embed_data.as_ref(),
        |text| text.to_string(),
    )
        .map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to build target layouts: {}", e))
        })
}

/// Converts an optional custom CreateMessage into an EditMessage builder
pub fn convert_create_to_edit_message(
    create_msg_opt: Option<serenity::all::CreateMessage>,
) -> serenity::all::EditMessage {
    let mut edit_builder = serenity::all::EditMessage::new();

    if let Some(create_msg) = create_msg_opt {
        if let Ok(val) = serde_json::to_value(&create_msg) {
            if let Some(content) = val.get("content").and_then(|v| v.as_str()) {
                edit_builder = edit_builder.content(content);
            }

            if let Some(embeds_json) = val.get("embeds").and_then(|v| v.as_array()) {
                let mut create_embeds = Vec::new();
                for embed_json in embeds_json {
                    if let Ok(embed) = serde_json::from_value::<serenity::all::Embed>(embed_json.clone()) {
                        create_embeds.push(serenity::all::CreateEmbed::from(embed));
                    }
                }
                edit_builder = edit_builder.embeds(create_embeds);
            }
        }
    } else {
        edit_builder = edit_builder.content("Please select your roles:");
    }

    edit_builder
}

pub async fn edit_reactions(state: &Arc<WebState>, config_row: &ReactionMessage, channel_id: &ChannelId, message_id: &MessageId) -> Result<(), (StatusCode, String)> {
    let reactions = fetch_active_reactions(&state.pool, config_row.id).await?;

    if let Ok(message) = channel_id.message(&state.http, message_id).await {
        for existing_reaction in message.reactions {
            let emoji_type = existing_reaction.reaction_type;

            let is_still_active = reactions.iter().any(|r| {
                if let Ok(active_emoji) = r.emoji.parse::<serenity::all::ReactionType>() {
                    active_emoji == emoji_type
                } else {
                    false
                }
            });

            if !is_still_active {
                if state.http.delete_message_reaction_emoji(*channel_id, *message_id, &emoji_type).await.is_err() {
                    let _ = state.http.delete_reaction_me(*channel_id, *message_id, &emoji_type).await;
                }
            }
        }
    }

    for r in reactions {
        if let Ok(emoji) = r.emoji.parse::<serenity::all::ReactionType>() {
            if let Err(err) = state.http.create_reaction(*channel_id, *message_id, &emoji).await {
                warn!(error = ?err, "Failed applying reaction emoji to edited post");
            }
        }
    }
    Ok(())
}