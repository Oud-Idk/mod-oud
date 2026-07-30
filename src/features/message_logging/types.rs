use crate::shared::opt_string_i64;
use crate::shared::string_i64;
use serde::{Deserialize, Serialize};
pub struct MessageDetails {
    pub(crate) msg_id: i64,
    pub(crate) author_id: i64,
    pub(crate) author_name: String,
    pub(crate) chan_id: i64,
    pub(crate) content: String,
    pub(crate) image_urls: Vec<String>,
}

pub struct EditDetails {
    pub(crate) msg_id: i64,
    pub(crate) chan_id: i64,
    pub(crate) author_id: i64,
    pub(crate) author_name: String,
    pub(crate) old_content: Option<String>,
    pub(crate) new_content: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DistributedCachedMessage {
    pub author_id: i64,
    pub author_name: String,
    pub content: String,
    pub image_urls: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MessageLoggingConfig {
    pub ignored_channels: Option<Vec<String>>,
    pub ignored_roles: Option<Vec<String>>,
    pub ignored_users: Option<Vec<String>>,
    pub events: Option<MessageEventsConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MessageEventsConfig {
    pub message_delete: Option<bool>,
    pub message_edit: Option<bool>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct DeletedMessagePayload {
    #[serde(with = "string_i64")]
    pub id: i64,
    #[serde(with = "string_i64")]
    pub guild_id: i64,
    pub author_name: String,
    pub content: String,
    #[serde(with = "string_i64")]
    pub channel_id: i64,
    pub deleted_at: String,
    pub attachment_url: String,
    #[serde(with = "opt_string_i64")]
    pub deleted_by_id: Option<i64>,
    pub deleted_by_name: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ModifiedMessagePayload {
    #[serde(with = "string_i64")]
    pub id: i64,
    #[serde(with = "string_i64")]
    pub guild_id: i64,
    pub author_name: String,
    #[serde(with = "string_i64")]
    pub channel_id: i64,
    pub old_content: Option<String>,
    pub new_content: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct CachedAuditLogs {
    pub entries: Vec<serenity::all::AuditLogEntry>,
    pub users: std::collections::HashMap<serenity::all::UserId, serenity::all::User>,
}