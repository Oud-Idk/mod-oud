use crate::utils::{opt_string_i64, string_i64};
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "report_status", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReportStatus {
    UnderReview,
    Actioned,
    Dismissed,
}