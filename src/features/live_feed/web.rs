use crate::core::config::state::WebState;
use crate::web::ticket::verify_ticket;
use axum::Router;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Sse;
use axum::response::sse::{Event, KeepAlive};
use axum::routing::get;
use futures::Stream;
use serde::Deserialize;
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::GuildId;
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use tracing::{debug, error, instrument, warn};

#[serde_as]
#[derive(Deserialize, Debug)]
pub struct SseQuery {
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: GuildId,
    /// Discord user ID of the ticket owner (issued by dashboard).
    #[serde(default)]
    pub user_id: Option<String>,
    /// Unix expiry seconds for the ticket.
    #[serde_as(as = "Option<DisplayFromStr>")]
    #[serde(default)]
    pub expires: Option<u64>,
    /// HMAC-SHA256 hex signature over "{guild_id}:{user_id}:{expires}:sse".
    #[serde(default)]
    pub sig: Option<String>,
}

#[instrument(skip(state))]
pub async fn sse_handler(
    State(state): State<Arc<WebState>>,
    Query(params): Query<SseQuery>,
) -> Result<Sse<impl Stream<Item=Result<Event, Infallible>>>, StatusCode> {
    // Ticket verification for real-time endpoint (signed ticket system).
    let Some(secret) = state.core.config.internal_api_secret.as_deref() else {
        warn!("INTERNAL_API_SECRET not set — rejecting SSE");
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    };
    let (Some(user_id), Some(expires), Some(sig)) = (params.user_id.as_deref(), params.expires, params.sig.as_deref()) else {
        warn!(guild_id = %params.guild_id, "Missing ticket for SSE");
        return Err(StatusCode::UNAUTHORIZED);
    };
    if !verify_ticket(
        &params.guild_id.to_string(),
        user_id,
        expires,
        sig,
        "sse",
        secret.as_bytes(),
    ) {
        let expected = crate::web::ticket::sign_ticket(
            &params.guild_id.to_string(),
            user_id,
            expires,
            "sse",
            secret.as_bytes(),
        );
        warn!(
            guild_id = %params.guild_id,
            user_id = %user_id,
            expires = expires,
            expected = %expected,
            "Invalid SSE ticket — sig mismatch (check INTERNAL_API_SECRET sync & purpose)"
        );
        return Err(StatusCode::UNAUTHORIZED);
    }

    debug!("New SSE subscription request received");

    let rx = state.message_event_tx.subscribe();

    let stream = BroadcastStream::new(rx)
        .filter_map(|msg| {
            msg.inspect_err(
                |e| warn!(error = %e, "SSE connection lagged and missed broadcast events"),
            )
                .ok()
        })
        .filter(move |msg| {
            msg.guild_id().is_some_and(|g_id| {
                let is_match = g_id == params.guild_id;
                if is_match {
                    debug!(guild_id = %g_id, "Routing matching event to client");
                }
                is_match
            })
        })
        .map(|msg| {
            let event = msg
                .to_sse_event()
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

/// Registers the live feed web route for the server-sent events stream.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new().route("/sse/events", get(sse_handler))
}
