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

#[derive(Deserialize)]
pub struct SseQuery {
    pub guild_id: String,
}

pub async fn sse_handler(
    State(state): State<Arc<WebState>>,
    Query(params): Query<SseQuery>,
) -> Sse<impl Stream<Item=Result<Event, Infallible>>> {
    let rx = state.tx.subscribe();
    let target_guild_id = params.guild_id;

    let stream = BroadcastStream::new(rx)
        .filter_map(|msg| msg.ok())
        .filter(move |msg| {
            match msg.guild_id() {
                Some(g_id) => g_id == target_guild_id,
                None => false,
            }
        })
        .map(|msg| {
            let event = msg.to_sse_event()
                .unwrap_or_else(|_| Event::default().data("serialization error"));
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
            "discord:deletes" => serde_json::from_str::<DeletedMessagePayload>(payload)
                .ok()
                .map(Self::MessageDelete),
            "discord:updates" => serde_json::from_str::<ModifiedMessagePayload>(payload)
                .ok()
                .map(Self::MessageEdit),
            "discord:reports" => serde_json::from_str::<ReportedMessagePayload>(payload)
                .ok()
                .map(Self::MessageReport), // <-- Added
            _ => None,
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
                Event::default().event("message-report").json_data(payload) // <-- Added
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