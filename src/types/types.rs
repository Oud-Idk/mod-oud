use crate::models::spam_tracker::SpamTracker;
use crate::SafeBrowsingClient;
use prost::Message;
use serde::{Deserialize, Serialize};

pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Context<'a> = poise::Context<'a, Data, Error>;

pub struct Data {
    pub db: sqlx::PgPool,
    pub redis: redis::aio::MultiplexedConnection,
    pub spam_tracker: SpamTracker,
    pub safe_browsing_client: Option<SafeBrowsingClient>,
}

#[derive(Clone, PartialEq, Message)]
pub struct Duration {
    #[prost(int64, tag = "1")]
    pub seconds: i64,
    #[prost(int32, tag = "2")]
    pub nanos: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct SearchUrlsResponse {
    #[prost(message, repeated, tag = "1")]
    pub threats: Vec<ThreatUrl>,
    #[prost(message, optional, tag = "2")]
    pub cache_duration: Option<Duration>,
}

#[derive(Clone, PartialEq, Message)]
pub struct ThreatUrl {
    #[prost(string, tag = "1")]
    pub url: String,
    // Google packs repeated enum fields into wire-level i32 sequences
    #[prost(int32, repeated, tag = "2")]
    pub threat_types: Vec<i32>,
}

pub struct LogConfig {
    pub title: &'static str,
    pub color: u32,
    pub reason_label: &'static str,
    pub reason_value: String,
}

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
pub struct ReportedMessagePayload {
    pub id: i32,
    pub guild_id: String,
    pub message_id: String,
    pub channel_id: String,
    pub reporter_name: String,
    pub author_name: String,
    pub reason: String,
    pub content: String,
    pub attachment_url: String, // comma-separated for some reason

    #[serde(default = "default_status")]
    pub status: String,
}

fn default_status() -> String {
    "under_review".to_string()
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
pub enum LogEvent {
    MessageDelete(DeletedMessagePayload),
    MessageEdit(ModifiedMessagePayload),
    MessageReport(ReportedMessagePayload),
}