use crate::core::config::message_layout::TogglableMessage;
use crate::shared::string_i64;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};

#[derive(Debug)]
pub enum ReportUpdate {
    Status(ReportStatus),
    MessageDeleted,
    UserWarned,
    UserTimedOut,
    UserBanned,
}

#[serde_as]
#[derive(Deserialize, Debug)]
#[serde(tag = "action", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DashboardAction {
    ResolveReport { status: ReportStatus },
    DeleteMessage {
        #[serde_as(as = "DisplayFromStr")] channel_id: u64,
        #[serde_as(as = "DisplayFromStr")] message_id: u64,
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
    pub moderator_id: Option<i64>,
    pub reason: Option<String>,
    pub duration_mins: Option<u64>,
    pub name: Option<String>,
}

/// Payload describing a reported message for the dashboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportedMessagePayload {
    /// ID of the report row.
    #[serde(with = "string_i64")]
    pub id: i64,
    /// ID of the guild the report belongs to.
    #[serde(with = "string_i64")]
    pub guild_id: i64,
    /// ID of the channel the reported message was in.
    #[serde(with = "string_i64")]
    pub channel_id: i64,
    /// ID of the reported message.
    #[serde(with = "string_i64")]
    pub message_id: i64,
    /// ID of the reported message's author.
    #[serde(with = "string_i64")]
    pub author_id: i64,
    /// ID of the user who filed the report.
    #[serde(with = "string_i64")]
    pub reporter_id: i64,
    /// Reason given for the report.
    pub reason: String,
    /// Content of the reported message.
    pub content: String,
    /// URL of an attachment on the reported message, if any.
    pub attachment_url: Option<String>,
    /// Current status of the report.
    pub status: ReportStatus,
    /// Whether the reported message was deleted.
    pub message_deleted: bool,
    /// Whether the author was warned.
    pub user_warned: bool,
    /// Whether the author was timed out.
    pub user_timed_out: bool,
    /// Whether the author was banned.
    pub user_banned: bool,
}

