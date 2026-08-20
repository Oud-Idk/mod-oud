use crate::core::config::message_layout::TogglableMessage;
use crate::shared::string_i64;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{ChannelId, GuildId, MessageId, UserId};

#[derive(Debug)]
pub enum ReportUpdate {
    Status(ReportStatus),
    MessageDeleted,
    UserWarned,
    UserTimedOut,
    UserBanned,
}

/// A boolean flag that serializes to/from a plain JSON boolean.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ReportFlag(bool);

impl ReportFlag {
    pub const fn is_set(self) -> bool {
        self.0
    }
}

impl From<bool> for ReportFlag {
    fn from(value: bool) -> Self {
        Self(value)
    }
}

impl From<ReportFlag> for bool {
    fn from(flag: ReportFlag) -> Self {
        flag.0
    }
}

#[serde_as]
#[derive(Deserialize, Debug)]
#[serde(tag = "action", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DashboardAction {
    ResolveReport {
        status: ReportStatus,
    },
    DeleteMessage {
        #[serde_as(as = "DisplayFromStr")]
        channel_id: ChannelId,
        #[serde_as(as = "DisplayFromStr")]
        message_id: MessageId,
    },
    WarnUser,
    TimeoutUser,
    BanUser,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "report_status", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReportStatus {
    UnderReview,
    Actioned,
    Dismissed,
}

/// Config for the reporting feature.
#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct ReportConfig {
    /// Whether reporting is enabled in the guild.
    pub enabled: bool,
    /// Message sent to the reporter when a report is resolved.
    pub resolved_dm: Option<TogglableMessage>,
    /// Message sent to the reporter when a report is dismissed.
    pub dismissed_dm: Option<TogglableMessage>,
}

#[derive(Deserialize, Debug)]
pub struct DashboardCommand {
    #[serde(flatten)]
    pub action: DashboardAction,
    #[serde(with = "string_i64")]
    pub report_id: i64,
    pub moderator_id: Option<UserId>,
    pub reason: Option<String>,
    pub duration_mins: Option<u64>,
    pub name: Option<String>,
}

/// Payload describing a reported message for the dashboard.
#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportedMessagePayload {
    /// ID of the report row.
    #[serde_as(as = "DisplayFromStr")]
    pub id: i64,
    /// ID of the guild the report belongs to.
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: GuildId,
    /// ID of the channel the reported message was in.
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: ChannelId,
    /// ID of the reported message.
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: MessageId,
    /// ID of the reported message's author.
    #[serde_as(as = "DisplayFromStr")]
    pub author_id: UserId,
    /// ID of the user who filed the report.
    #[serde_as(as = "DisplayFromStr")]
    pub reporter_id: UserId,
    /// Reason given for the report.
    pub reason: String,
    /// Content of the reported message.
    pub content: String,
    /// URL of an attachment on the reported message, if any.
    pub attachment_url: Option<String>,
    /// Current status of the report.
    pub status: ReportStatus,
    /// Whether the reported message was deleted.
    pub message_deleted: ReportFlag,
    /// Whether the author was warned.
    pub user_warned: ReportFlag,
    /// Whether the author was timed out.
    pub user_timed_out: ReportFlag,
    /// Whether the author was banned.
    pub user_banned: ReportFlag,
}
