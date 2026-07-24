use crate::features::message_logging::{DeletedMessagePayload, ModifiedMessagePayload};
use crate::features::reporting::ReportedMessagePayload;
use axum::response::sse::Event;
use serde::{Deserialize, Serialize};
use tracing::warn;

impl LogEvent {
    pub const REDIS_CHANNELS: &'static [&'static str] = &[
        "discord:deletes",
        "discord:updates",
        "discord:reports",
    ];

    pub fn from_redis(channel: &str, payload: &str) -> Option<Self> {
        match channel {
            "discord:deletes" => serde_json::from_str::<DeletedMessagePayload>(payload)
                .inspect_err(|e| warn!(error = %e, %channel, "Failed to deserialize DeletedMessagePayload"))
                .ok().map(Self::MessageDelete),

            "discord:updates" => serde_json::from_str::<ModifiedMessagePayload>(payload)
                .inspect_err(|e| warn!(error = %e, %channel, "Failed to deserialize ModifiedMessagePayload"))
                .ok().map(Self::MessageEdit),

            "discord:reports" => serde_json::from_str::<ReportedMessagePayload>(payload)
                .inspect_err(|e| warn!(error = %e, %channel, "Failed to deserialize ReportedMessagePayload"))
                .ok().map(Self::MessageReport),

            _ => {
                warn!(%channel, "Received subscription data from an unexpected channel");
                None
            }
        }
    }

    pub fn to_sse_event(&self) -> Result<Event, axum::Error> {
        match self {
            LogEvent::MessageDelete(payload) => {
                Event::default().event("message-delete").json_data(payload)
            }
            LogEvent::MessageEdit(payload) => {
                Event::default().event("message-edit").json_data(payload)
            }
            LogEvent::MessageReport(payload) => {
                Event::default().event("message-report").json_data(payload)
            }
        }
    }

    pub fn guild_id(&self) -> Option<i64> {
        match self {
            LogEvent::MessageDelete(payload) => Some(payload.guild_id),
            LogEvent::MessageEdit(payload) => Some(payload.guild_id),
            LogEvent::MessageReport(payload) => Some(payload.guild_id),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
pub enum LogEvent {
    MessageDelete(DeletedMessagePayload),
    MessageEdit(ModifiedMessagePayload),
    MessageReport(ReportedMessagePayload),
}