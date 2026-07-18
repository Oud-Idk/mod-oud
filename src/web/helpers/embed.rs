use crate::types::config::config::Format;
use crate::types::embed::DiscordEmbed;
use crate::types::Error;
use crate::utils::custom_msg::build_custom_message;
use crate::web::routes::send_temp_voice_interface::{SendTempVoiceInterfacePayload, SendTempVoiceInterfaceResponse};
use axum::http::StatusCode;
use serenity::all::CreateMessage;
use tracing::warn;

pub trait EmbedGetters {
    fn content(&self) -> Option<&str>;
    fn embed(&self) -> Option<&DiscordEmbed>;
    fn format(&self) -> Option<&Format>;
}

pub fn create_basic_embed<T, F>(payload: &T, replace_fn: Option<F>) -> Result<Option<CreateMessage>, Error>
where
    T: EmbedGetters,
    F: Fn(&str) -> String
{
    let is_embed = payload.format().map_or(true, |f| matches!(f, Format::Embed));
    fn default_replace_fn(text: &str) -> String {
        text.to_string()
    }

    build_custom_message(
        is_embed,
        payload.content(),
        payload.embed(),
        |text| {
            match &replace_fn {
                Some(f) => f(text),
                None => default_replace_fn(text),
            }
        }
    )
}


pub fn create_embed_for_web<T, F>(payload: &T, replace_fn: Option<F>) -> Result<CreateMessage, (StatusCode, String)>
where
    T: EmbedGetters,
    F: Fn(&str) -> String
{
    Ok(
        match create_basic_embed(payload, replace_fn) {
            Ok(Some(builder)) => builder,
            Ok(None) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "Cannot send an empty message. Please provide either text content or a populated embed.".to_string(),
                ));
            }
            Err(e) => {
                warn!(error = ?e, "Failed to parse custom embed format");
                return Err((
                    StatusCode::BAD_REQUEST,
                    format!("Failed to compile embed: {}", e),
                ));
            }
        }
    )
}