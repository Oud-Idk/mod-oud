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

/// Config for which channels, roles, and users to ignore in message logging,
/// and which events to log.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MessageLoggingConfig {
    /// Channels that are excluded from logging.
    pub ignored_channels: Option<Vec<String>>,
    /// Roles whose members are excluded from logging.
    pub ignored_roles: Option<Vec<String>>,
    /// Users who are excluded from logging.
    pub ignored_users: Option<Vec<String>>,
    /// Which events are enabled.
    pub events: Option<MessageEventsConfig>,
}

/// Toggles for the message logging event types.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MessageEventsConfig {
    /// Whether message deletions are logged.
    pub message_delete: Option<bool>,
    /// Whether message edits are logged.
    pub message_edit: Option<bool>,
}

/// Payload sent to the dashboard when a message is deleted.
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct DeletedMessagePayload {
    /// ID of the deleted message.
    #[serde(with = "string_i64")]
    pub id: i64,
    /// ID of the guild the message was deleted in.
    #[serde(with = "string_i64")]
    pub guild_id: i64,
    /// ID of the message's author.
    #[serde(with = "string_i64")]
    pub author_id: i64,
    /// Username of the message's author.
    pub author_name: String,
    /// Content of the deleted message.
    pub content: String,
    /// ID of the channel the message was deleted in.
    #[serde(with = "string_i64")]
    pub channel_id: i64,
    /// ISO timestamp of when the message was deleted.
    pub deleted_at: String,
    /// URL of an attachment, if the message had one.
    pub attachment_url: String,
    /// ID of the user who deleted the message, if known.
    #[serde(with = "opt_string_i64")]
    pub deleted_by_id: Option<i64>,
    /// Name of the user who deleted the message, if known.
    pub deleted_by_name: Option<String>,
}

/// Payload sent to the dashboard when a message is edited.
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ModifiedMessagePayload {
    /// ID of the edited message.
    #[serde(with = "string_i64")]
    pub id: i64,
    /// ID of the guild the message was edited in.
    #[serde(with = "string_i64")]
    pub guild_id: i64,
    /// ID of the message's author.
    #[serde(with = "string_i64")]
    pub author_id: i64,
    /// Username of the message's author.
    pub author_name: String,
    /// ID of the channel the message was edited in.
    #[serde(with = "string_i64")]
    pub channel_id: i64,
    /// Content of the message before the edit, if known.
    pub old_content: Option<String>,
    /// Content of the message after the edit.
    pub new_content: Option<String>,
    /// ISO timestamp of when the message was edited.
    pub updated_at: String,
}

/// Audit log entries and the users they reference, cached from the Discord API.
#[derive(Debug, Clone)]
pub struct CachedAuditLogs {
    /// The audit log entries.
    pub entries: Vec<serenity::all::AuditLogEntry>,
    /// Users referenced by the audit log entries.
    pub users: std::collections::HashMap<serenity::all::UserId, serenity::all::User>,
}