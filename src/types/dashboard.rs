use crate::types::payloads::ReportStatus;
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
    pub report_id: i32,
    pub moderator_id: Option<String>,
    pub reason: Option<String>,
    pub duration_mins: Option<u64>,
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