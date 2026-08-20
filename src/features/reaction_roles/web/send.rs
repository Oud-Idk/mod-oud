use crate::core::config::state::WebState;
use crate::features::reaction_roles::database;
use crate::features::reaction_roles::database::{fetch_active_reactions, fetch_reaction_message};
use crate::features::reaction_roles::types::InteractionMode;
use crate::features::reaction_roles::web::helpers::{
    build_custom_msg, fetch_and_build_buttons, parse_config_id,
};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Serialize;
use serde_with::{DisplayFromStr, serde_as};
use serenity::model::id::{GuildId, MessageId};
use std::sync::Arc;
use tracing::{debug, info, warn};

#[serde_as]
#[derive(Serialize)]
pub struct SendReactionMessageResponse {
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: MessageId,
}

pub async fn handle_send_reaction_role_message(
    State(state): State<Arc<WebState>>,
    Path((guild_id, config_id_str)): Path<(GuildId, String)>,
) -> Result<(StatusCode, Json<SendReactionMessageResponse>), (StatusCode, String)> {
    debug!(
        %guild_id,
        config_id = config_id_str,
        "Dispatching reaction roles message"
    );

    let config_id = parse_config_id(&config_id_str)?;
    let config_row = fetch_reaction_message(&state.core.db, config_id, guild_id).await?;
    let channel_id = config_row.channel_id;

    let custom_msg_opt = build_custom_msg(
        config_row.message.format,
        &config_row.message.content,
        &config_row.message.embed,
    )?;
    let mut message_builder = custom_msg_opt.unwrap_or_else(|| {
        serenity::all::CreateMessage::default().content("Please select your roles:")
    });

    match config_row.mode {
        InteractionMode::Button => {
            let button_components = fetch_and_build_buttons(&state.core.db, config_row.id).await?;
            if !button_components.is_empty() {
                message_builder =
                    message_builder.components(vec![serenity::all::CreateActionRow::Buttons(
                        button_components,
                    )]);
            }
        }
        InteractionMode::Reaction => {}
    }

    let message = channel_id
        .send_message(&state.serenity_http, message_builder)
        .await
        .map_err(|e| {
            warn!(error = ?e, "Failed to send payload to Discord channel");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error".to_string(),
            )
        })?;

    if matches!(config_row.mode, InteractionMode::Reaction) {
        let reactions = fetch_active_reactions(&state.core.db, config_row.id).await?;
        for r in reactions {
            if let Ok(emoji) = r.emoji.parse::<serenity::all::ReactionType>()
                && let Err(err) = message.react(&state.serenity_http, emoji).await
            {
                warn!(error = ?err, "Failed applying reaction emoji to post");
            }
        }
    }

    let message_id = message.id;
    let _ = database::add_message_to_db(&state, &config_row, message_id).await;

    info!(
        %guild_id,
        %message_id,
        "Reaction role layout successfully processed"
    );

    Ok((
        StatusCode::OK,
        Json(SendReactionMessageResponse { message_id }),
    ))
}
