use crate::features::message_logging::{DeletedMessagePayload, ModifiedMessagePayload};
use crate::features::reporting::ReportedMessagePayload;
use axum::response::sse::Event;
use serde::{Deserialize, Serialize};
use tracing::warn;

impl LogEvent {
    /// Redis pub/sub channels the live feed subscribes to.
    pub const REDIS_CHANNELS: &'static [&'static str] = &[
        "discord:deletes",
        "discord:updates",
        "discord:reports",
    ];

    /// Deserializes a payload from the given Redis channel into a [`LogEvent`].
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

    /// Converts the event into a server-sent event for the dashboard's SSE stream.
    pub fn to_sse_event(&self) -> Result<Event, axum::Error> {
        match self {
            Self::MessageDelete(payload) => {
                Event::default().event("message-delete").json_data(payload)
            }
            Self::MessageEdit(payload) => {
                Event::default().event("message-edit").json_data(payload)
            }
            Self::MessageReport(payload) => {
                Event::default().event("message-report").json_data(payload)
            }
        }
    }

    /// Returns the guild ID associated with this event, if any.
    #[must_use]
    pub const fn guild_id(&self) -> Option<i64> {
        match self {
            Self::MessageDelete(payload) => Some(payload.guild_id),
            Self::MessageEdit(payload) => Some(payload.guild_id),
            Self::MessageReport(payload) => Some(payload.guild_id),
        }
    }
}

/// An event streamed to the dashboard over SSE.
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
pub enum LogEvent {
    /// A message was deleted.
    MessageDelete(DeletedMessagePayload),
    /// A message was edited.
    MessageEdit(ModifiedMessagePayload),
    /// A message was reported.
    MessageReport(ReportedMessagePayload),
}