use crate::core::config::message_layout::MessageLayout;
use serenity::all::{ChannelId, MessageId};
use sqlx::types::Json;

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, serde::Deserialize, serde::Serialize)]
#[sqlx(type_name = "interaction_mode", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InteractionMode {
    Reaction,
    Button,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, serde::Deserialize, serde::Serialize)]
#[sqlx(type_name = "button_style", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ButtonStyle {
    Primary,
    Secondary,
    Success,
    Danger,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct ReactionRole {
    pub emoji: String,
}

#[derive(Debug, Clone)]
pub struct ReactionMessage {
    pub id: i64,
    pub message_id: Option<MessageId>,
    pub channel_id: ChannelId,
    pub mode: InteractionMode,
    pub message: Json<MessageLayout>,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct ButtonRole {
    pub custom_id: String,
    pub label: Option<String>,
    pub style: ButtonStyle,
    pub emoji: Option<String>,
}
