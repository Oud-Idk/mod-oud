use crate::shared::embed::Format;

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
    pub id: i64,
    pub reaction_message_id: Option<i64>,
    pub emoji: String,
    pub role_id: i64,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct ReactionMessage {
    pub id: i64,
    pub message_id: Option<i64>,
    pub name: String,
    pub channel_id: i64,
    pub guild_id: i64,
    pub mode: InteractionMode,
    pub format: Format,
    pub embed: Option<String>,
    pub content: Option<String>,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct ButtonRole {
    pub id: i64,
    pub reaction_message_id: Option<i64>,
    pub role_id: i64,
    pub custom_id: i64,
    pub label: Option<String>,
    pub style: ButtonStyle,
    pub emoji: Option<String>,
}