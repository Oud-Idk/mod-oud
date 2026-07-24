use crate::core::config::state::WebState;
use crate::features::message_logging::{DeletedMessagePayload, ModifiedMessagePayload};
use crate::features::reporting::ReportedMessagePayload;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Sse;
use axum::response::sse::{Event, KeepAlive};
use futures::Stream;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;
use axum::Router;
use axum::routing::get;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
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

pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/sse/events", get(sse_handler))
}