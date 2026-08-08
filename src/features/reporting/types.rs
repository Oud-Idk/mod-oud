use crate::core::config::settings::{MessageLayout, TogglableMessage};
use crate::shared::string_i64;
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, DisplayFromStr};

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

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct ReportConfig {
    pub enabled: bool,
    pub resolved_dm: Option<TogglableMessage>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportedMessagePayload {
    #[serde(with = "string_i64")]
    pub id: i64,
    #[serde(with = "string_i64")]
    pub guild_id: i64,
    #[serde(with = "string_i64")]
    pub channel_id: i64,
    #[serde(with = "string_i64")]
    pub message_id: i64,
    #[serde(with = "string_i64")]
    pub author_id: i64,
    #[serde(with = "string_i64")]
    pub reporter_id: i64,
    pub reason: String,
    pub content: String,
    pub attachment_url: Option<String>,
    pub status: ReportStatus,
    pub message_deleted: bool,
    pub user_warned: bool,
    pub user_timed_out: bool,
    pub user_banned: bool,
}

