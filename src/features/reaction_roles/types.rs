use crate::core::config::message_layout::MessageLayout;
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
    pub id: i64,
    pub reaction_message_id: Option<i64>,
    pub emoji: String,
    pub role_id: i64,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct ReactionMessage {
    pub id: i64,
    pub message_id: Option<i64>,
    pub channel_id: Option<i64>,
    pub name: String,
    pub guild_id: i64,
    pub mode: InteractionMode,
    pub message: Json<MessageLayout>,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct ButtonRole {
    pub id: i64,
    pub reaction_message_id: Option<i64>,
    pub role_id: i64,
    pub custom_id: String,
    pub label: Option<String>,
    pub style: ButtonStyle,
    pub emoji: Option<String>,
}