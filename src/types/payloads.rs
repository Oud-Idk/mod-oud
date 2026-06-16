use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct DeletedMessagePayload {
    pub id: String,
    pub guild_id: String,
    pub author_name: String,
    pub content: String,
    pub channel_id: String,
    pub deleted_at: String,
    pub attachment_url: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ModifiedMessagePayload {
    pub id: String,
    pub guild_id: String,
    pub author_name: String,
    pub channel_id: String,
    pub old_content: Option<String>,
    pub new_content: Option<String>,
    pub edited_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ReportedMessagePayload {
    pub id: i32,
    pub guild_id: String,
    pub channel_id: String,
    pub message_id: String,
    pub reporter_name: String,
    pub author_name: String,
    pub reason: String,
    pub content: String,
    pub attachment_url: String,
    pub status: ReportStatus,
    pub message_deleted: bool,
    pub(crate) user_warned: bool,
    pub(crate) user_timed_out: bool,
    pub(crate) user_banned: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "report_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ReportStatus {
    UnderReview,
    Actioned,
    Dismissed,
}