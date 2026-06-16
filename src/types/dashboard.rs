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
pub(crate) struct DashboardCommand {
    #[serde(flatten)]
    pub(crate) action: DashboardAction,
    pub(crate) report_id: i32,
    pub(crate) moderator_id: Option<String>,
    pub(crate) reason: Option<String>,
    pub(crate) duration_mins: Option<u64>,
    pub(crate) status: Option<ReportStatus>,
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