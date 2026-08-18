use crate::core::config::message_layout::MessageLayout as CustomMessagePayload;
use serde::{Deserialize, Serialize};
use serenity::all::{ChannelId, GuildId, RoleId};
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
    pub guild_id: GuildId,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub delete_trigger: bool,
    pub cooldown_type: CooldownType,
    pub cooldown_seconds: i32,
    pub allowed_roles: Vec<RoleId>,
    pub ignored_roles: Vec<RoleId>,
    pub allowed_channels: Vec<ChannelId>,
    pub ignored_channels: Vec<ChannelId>,
    pub actions: Json<Vec<CommandAction>>,
}

#[derive(sqlx::FromRow)]
pub struct CustomCommandRow {
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

impl From<CustomCommandRow> for CustomCommand {
    fn from(row: CustomCommandRow) -> Self {
        Self {
            id: row.id,
            guild_id: GuildId::new(row.guild_id as u64),
            name: row.name,
            description: row.description,
            enabled: row.enabled,
            delete_trigger: row.delete_trigger,
            cooldown_type: row.cooldown_type,
            cooldown_seconds: row.cooldown_seconds,
            allowed_roles: row.allowed_roles.into_iter().map(|id| RoleId::new(id as u64)).collect(),
            ignored_roles: row.ignored_roles.into_iter().map(|id| RoleId::new(id as u64)).collect(),
            allowed_channels: row.allowed_channels.into_iter().map(|id| ChannelId::new(id as u64)).collect(),
            ignored_channels: row.ignored_channels.into_iter().map(|id| ChannelId::new(id as u64)).collect(),
            actions: row.actions,
        }
    }
}