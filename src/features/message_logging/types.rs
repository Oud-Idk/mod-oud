use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{AuditLogEntry, ChannelId, GuildId, MessageId, RoleId, User, UserId};
use std::collections::HashMap;

pub struct MessageDetails {
    pub msg_id: MessageId,
    pub chan_id: ChannelId,
    pub author_id: UserId,
    pub author_name: String,
    pub content: String,
    pub image_urls: Vec<String>,
}

pub struct EditDetails {
    pub msg_id: MessageId,
    pub chan_id: ChannelId,
    pub author_id: UserId,
    pub author_name: String,
    pub old_content: Option<String>,
    pub new_content: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DistributedCachedMessage {
    pub author_id: UserId,
    pub author_name: String,
    pub content: String,
    pub image_urls: Vec<String>,
}

/// Config for which channels, roles, and users to ignore in message logging,
/// and which events to log.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde_as]
#[serde(rename_all = "camelCase")]
pub struct MessageLoggingConfig {
    /// Channels that are excluded from logging.
    #[serde_as(as = "Option<Vec<DisplayFromStr>>")]
    pub ignored_channels: Option<Vec<ChannelId>>,
    /// Roles whose members are excluded from logging.
    #[serde_as(as = "Option<Vec<DisplayFromStr>>")]
    pub ignored_roles: Option<Vec<RoleId>>,
    /// Users who are excluded from logging.
    #[serde_as(as = "Option<Vec<DisplayFromStr>>")]
    pub ignored_users: Option<Vec<UserId>>,
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
#[serde_as]
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct DeletedMessagePayload {
    /// ID of the deleted message.
    #[serde_as(as = "DisplayFromStr")]
    pub id: MessageId,
    /// ID of the guild the message was deleted in.
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: GuildId,
    /// ID of the message's author.
    #[serde_as(as = "DisplayFromStr")]
    pub author_id: UserId,
    /// Username of the message's author.
    pub author_name: String,
    /// Content of the deleted message.
    pub content: String,
    /// ID of the channel the message was deleted in.
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: ChannelId,
    /// ISO timestamp of when the message was deleted.
    pub deleted_at: String,
    /// URL of an attachment, if the message had one.
    pub attachment_url: String,
    /// ID of the user who deleted the message, if known.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub deleted_by_id: Option<UserId>,
    /// Name of the user who deleted the message, if known.
    pub deleted_by_name: Option<String>,
}

/// Payload sent to the dashboard when a message is edited.
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde_as]
pub struct ModifiedMessagePayload {
    /// ID of the edited message.
    #[serde_as(as = "DisplayFromStr")]
    pub id: MessageId,
    /// ID of the guild the message was edited in.
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: GuildId,
    /// ID of the message's author.
    #[serde_as(as = "DisplayFromStr")]
    pub author_id: UserId,
    /// Username of the message's author.
    pub author_name: String,
    /// ID of the channel the message was edited in.
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: ChannelId,
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
    pub entries: Vec<AuditLogEntry>,
    /// Users referenced by the audit log entries.
    pub users: HashMap<UserId, User>,
}
