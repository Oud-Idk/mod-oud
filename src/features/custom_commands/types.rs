use crate::core::config::message_layout::MessageLayout as CustomMessagePayload;
use serde::{Deserialize, Serialize};
use sqlx::types::Json;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "COMMAND_COOLDOWN_TYPE", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CooldownType {
    None,
    User,
    Server,
}

/// Dedicated sub-field for all message execution layout & logic
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct MessageLayout {
    pub messages: Vec<CustomMessagePayload>,
    pub randomize: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum CommandAction {
    SendChannelMessage {
        channel_id: String,
        message_layout: MessageLayout,
    },
    RespondCurrentChannel {
        is_dm: bool,
        is_ephemeral: bool,
        message_layout: MessageLayout,
    },
    AddRole {
        role_id: String,
    },
    RemoveRole {
        role_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomCommand {
    pub id: i64,
    pub guild_id: i64,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub delete_trigger: bool,
    pub cooldown_type: CooldownType,
    pub cooldown_seconds: i32,
    pub allowed_roles: Vec<i64>,
    pub ignored_roles: Vec<i64>,
    pub allowed_channels: Vec<i64>,
    pub ignored_channels: Vec<i64>,
    pub actions: Json<Vec<CommandAction>>,
}