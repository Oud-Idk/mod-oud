use crate::constants::BRAND_COLOR;
use crate::core::config::guild_ctx::GuildCtx;
use crate::core::config::message_layout::MessageLayout;
use crate::features::giveaways::placeholders;
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serenity::all::{CreateEmbed, CreateMessage, EditMessage, Embed, User};

pub fn parse_config_id(config_id_str: &str) -> Result<i64, (StatusCode, String)> {
    config_id_str.parse::<i64>().map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "Invalid Configuration ID format".to_string(),
        )
    })
}

/// Builds a custom layout or default Giveaway message builder
pub fn build_giveaway_msg(
    message: &MessageLayout,
    prize: &str,
    winner_count: i32,
    end_time: DateTime<Utc>,
    host_user: &User,
    gctx: &GuildCtx,
) -> Result<Option<CreateMessage>, (StatusCode, String)> {
    let end_time_str = end_time.timestamp().to_string();

    let create_msg = crate::shared::embed::build_custom_message(
        message.format,
        &message.content,
        &message.embed,
        |text| {
            placeholders::replace_giveaway_placeholders(
                text,
                prize,
                winner_count,
                host_user,
                gctx,
                &end_time_str,
            )
        },
    )
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal Server Error".to_string(),
        )
    })?;

    // Fallback if no custom format is specified or empty
    let final_msg = create_msg.unwrap_or_else(|| {
        let default_embed = serenity::all::CreateEmbed::new()
            .title("🎉 GIVEAWAY 🎉")
            .description(format!(
                "**Prize:** {prize}\n**Winners:** {winner_count}\n**Ends:** <t:{end_time_str}:R>\n\nReact with 🎉 to enter!"
            ))
            .color(BRAND_COLOR);

        CreateMessage::new().embed(default_embed)
    });

    Ok(Some(final_msg))
}

pub fn convert_create_to_edit_message(create_msg_opt: Option<CreateMessage>) -> EditMessage {
    let mut edit_builder = EditMessage::new();

    if let Some(create_msg) = create_msg_opt {
        // Serialize CreateMessage to JSON to inspect content & embeds
        if let Ok(val) = serde_json::to_value(&create_msg) {
            // Extract and apply message content
            if let Some(content) = val.get("content").and_then(|v| v.as_str()) {
                edit_builder = edit_builder.content(content);
            } else {
                // Clear content if not present
                edit_builder = edit_builder.content("");
            }

            // Extract and apply embeds
            if let Some(embeds_json) = val.get("embeds").and_then(|v| v.as_array()) {
                let mut create_embeds = Vec::new();
                for embed_json in embeds_json {
                    if let Ok(embed) = serde_json::from_value::<Embed>(embed_json.clone()) {
                        create_embeds.push(CreateEmbed::from(embed));
                    }
                }
                edit_builder = edit_builder.embeds(create_embeds);
            }
        }
    }

    edit_builder
}
