use crate::types::payloads::{DeletedMessagePayload, ModifiedMessagePayload, ReportedMessagePayload};
use crate::types::LogEvent;
use crate::WebState;
use axum::extract::{Query, State};
use axum::http::StatusCode;
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
) -> Result<Sse<impl Stream<Item=Result<Event, Infallible>>>, StatusCode> {
    debug!("New SSE subscription request received");

    let guild_id_i64 = params.guild_id.parse::<i64>()
        .inspect_err(|e| warn!(error = ?e, guild_id = params.guild_id, "Failed to parse guild ID"))
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let rx = state.tx.subscribe();

    let stream = BroadcastStream::new(rx)
        .filter_map(|msg| {
            msg.inspect_err(|e| warn!(error = %e, "SSE connection lagged and missed broadcast events"))
                .ok()
        })
        .filter(move |msg| {
            msg.guild_id().is_some_and(|g_id| {
                let is_match = g_id == guild_id_i64;
                if is_match {
                    debug!(guild_id = %g_id, "Routing matching event to client");
                }
                is_match
            })
        })
        .map(|msg| {
            let event = msg.to_sse_event()
                .inspect_err(|e| error!(error = %e, "Failed to serialize event payload to SSE"))
                .unwrap_or_else(|_| Event::default().data("serialization error"));
            Ok(event)
        });

    Ok(Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    ))
}

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