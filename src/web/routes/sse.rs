use crate::types::payloads::{DeletedMessagePayload, ModifiedMessagePayload, ReportedMessagePayload};
use crate::types::LogEvent;
use crate::WebState;
use axum::extract::{Query, State};
use axum::response::sse::{Event, KeepAlive};
use axum::response::Sse;
use futures::Stream;
use serde::Deserialize;
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tracing::{debug, error, instrument, warn};

#[derive(Deserialize, Debug)]
pub struct SseQuery {
    pub guild_id: String,
}

#[instrument(skip(state))]
pub async fn sse_handler(
    State(state): State<Arc<WebState>>,
    Query(params): Query<SseQuery>,
) -> Sse<impl Stream<Item=Result<Event, Infallible>>> {
    debug!("New SSE subscription request received");

    let rx = state.tx.subscribe();
    let target_guild_id = params.guild_id;

    let stream = BroadcastStream::new(rx)
        .filter_map(|msg| {
            match msg {
                Ok(event) => Some(event),
                Err(e) => {
                    // Log when a client's stream lags behind the global broadcast sender
                    warn!(error = %e, "SSE connection lagged and missed broadcast events");
                    None
                }
            }
        })
        .filter(move |msg| {
            match msg.guild_id() {
                Some(g_id) => {
                    let is_match = g_id == target_guild_id;
                    if is_match {
                        debug!(guild_id = %g_id, "Routing matching event to client");
                    }
                    is_match
                }
                None => false,
            }
        })
        .map(|msg| {
            let event = msg.to_sse_event().unwrap_or_else(|e| {
                error!(error = %e, "Failed to serialize event payload to SSE");
                Event::default().data("serialization error")
            });
            Ok(event)
        });

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    )
}

impl LogEvent {
    pub const REDIS_CHANNELS: &'static [&'static str] = &[
        "discord:deletes",
        "discord:updates",
        "discord:reports",
    ];

    pub fn from_redis(channel: &mut String, payload: &str) -> Option<Self> {
        match channel.as_str() {
            "discord:deletes" => match serde_json::from_str::<DeletedMessagePayload>(payload) {
                Ok(parsed) => Some(Self::MessageDelete(parsed)),
                Err(e) => {
                    warn!(error = %e, channel = "discord:deletes", "Failed to deserialize DeletedMessagePayload");
                    None
                }
            }
            "discord:updates" => match serde_json::from_str::<ModifiedMessagePayload>(payload) {
                Ok(parsed) => Some(Self::MessageEdit(parsed)),
                Err(e) => {
                    warn!(error = %e, channel = "discord:updates", "Failed to deserialize ModifiedMessagePayload");
                    None
                }
            }
            "discord:reports" => match serde_json::from_str::<ReportedMessagePayload>(payload) {
                Ok(parsed) => Some(Self::MessageReport(parsed)),
                Err(e) => {
                    warn!(error = %e, channel = "discord:reports", "Failed to deserialize ReportedMessagePayload");
                    None
                }
            }
            _ => {
                warn!(channel = %channel, "Received subscription data from an unexpected channel");
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

    pub fn guild_id(&self) -> Option<&str> {
        match self {
            LogEvent::MessageDelete(payload) => Some(&payload.guild_id),
            LogEvent::MessageEdit(payload) => Some(&payload.guild_id),
            LogEvent::MessageReport(payload) => Some(&payload.guild_id),
        }
    }
}