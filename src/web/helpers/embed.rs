use crate::types::embed::DiscordEmbed;
use crate::utils::custom_msg::build_custom_message;
use crate::web::routes::send_temp_voice_interface::{SendTempVoiceInterfacePayload, SendTempVoiceInterfaceResponse};
use axum::http::StatusCode;
use serenity::all::CreateMessage;
use tracing::warn;

pub trait ContentAndFormat {
    fn content(&self) -> Option<&str>;
    fn embed(&self) -> Option<&DiscordEmbed>;
}


pub fn create_embed_for_web<T, F>(payload: &T, is_embed: bool, replace_fn: Option<F>) -> Result<CreateMessage, (StatusCode, String)>
where
    T: ContentAndFormat,
    F: Fn(&str) -> String
{
    fn default_replace_fn(text: &str) -> String {
        text.to_string()
    }

    Ok(match build_custom_message(
        is_embed,
        payload.content(),
        payload.embed(),
        |text| {
            match &replace_fn {
                Some(f) => f(text),
                None => default_replace_fn(text),
            }
        },
    ) {
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
    })
}