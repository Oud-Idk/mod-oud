use crate::types::payloads::ReportStatus;
use crate::utils::string_i64;
use serde::Deserialize;

#[derive(Debug)]
pub enum ReportUpdate {
    Status(ReportStatus),
    MessageDeleted,
    UserWarned,
    UserTimedOut,
    UserBanned,
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

#[derive(Deserialize, Debug)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum DashboardAction {
    ResolveReport { status: ReportStatus },
    DeleteMessage { channel_id: String, message_id: String },
    WarnUser,
    TimeoutUser,
    BanUser,
}