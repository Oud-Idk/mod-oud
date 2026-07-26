use serde::{Deserialize, Serialize};
use sqlx::types::Json;
use crate::shared::embed::{DiscordEmbed, Format};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "COMMAND_COOLDOWN_TYPE", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CooldownType {
    None,
    User,
    Server,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum CommandAction {
    SendChannelMessage {
        channel_id: String,
        messages: Vec<CustomMessagePayload>,
        randomize: bool,
    },
    RespondCurrentChannel {
        is_dm: bool,
        is_ephemeral: bool,
        messages: Vec<CustomMessagePayload>,
        randomize: bool,
    },
    AddRole {
        role_id: String,
    },
    RemoveRole {
        role_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomMessagePayload {
    pub format: Format,
    pub content: Option<String>,
    pub embed: Option<DiscordEmbed>,
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