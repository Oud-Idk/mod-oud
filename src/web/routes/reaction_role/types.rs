use crate::types::config::config::Format;

#[derive(Debug, Clone, Copy, PartialEq, sqlx::Type, serde::Deserialize, serde::Serialize)]
#[sqlx(type_name = "interaction_mode", rename_all = "lowercase")]
pub enum InteractionMode {
    Reaction,
    Button,
}

#[derive(Debug, Clone, Copy, PartialEq, sqlx::Type, serde::Deserialize, serde::Serialize)]
#[sqlx(type_name = "button_style", rename_all = "lowercase")]
pub enum ButtonStyle {
    Primary,
    Secondary,
    Success,
    Danger,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct ReactionRole {
    pub id: i32,
    pub reaction_message_id: Option<i32>,
    pub emoji: String,
    pub role_id: String,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct ReactionMessage {
    pub id: i32,
    pub message_id: Option<String>,
    pub name: String,
    pub channel_id: String,
    pub guild_id: String,
    pub mode: InteractionMode,
    pub format: Format,
    pub embed: Option<String>,
    pub content: Option<String>,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct ButtonRole {
    pub id: i32,
    pub reaction_message_id: Option<i32>,
    pub role_id: String,
    pub custom_id: String,
    pub label: Option<String>,
    pub style: ButtonStyle,
    pub emoji: Option<String>,
}