use crate::core::config::state::WebState;
use crate::features::{
    automod, general, giveaways, live_feed, member_counter, moderation, music, reaction_roles,
    reporting, social_notifications, temp_voice, tickets, verification,
};
use crate::web::middleware::require_internal_secret;
use axum::Router;
use axum::extract::{MatchedPath, Request};
use axum::http::{Method, StatusCode, Uri};
use axum::middleware::Next;
use axum::response::Response;
use axum::routing::get;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use tower_http::cors::CorsLayer;
use tracing::{Instrument, debug, error, field, info, info_span, instrument};

/// Fallback `request_id` for requests that arrive without an `x-request-id`.
static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

#[instrument]
async fn health_check() -> &'static str {
    debug!("Health check endpoint called");
    "OK"
}

#[instrument]
async fn handle_404(method: Method, uri: Uri) -> (StatusCode, &'static str) {
    debug!(method = %method, uri = %uri, "404 Not Found");
    (StatusCode::NOT_FOUND, "Not Found. Meow :3")
}

/// Traces one request at `INFO`, because a successful call is otherwise invisible under the default
/// filter and there is no way to tell whether the hub called us at all.
///
/// `path` is the route pattern rather than the URI, since feed ids would blow up cardinality.
async fn http_trace(request: Request, next: Next) -> Response {
    let request_id = request
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .map_or_else(
            || REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed).to_string(),
            ToOwned::to_owned,
        );

    let path = request
        .extensions()
        .get::<MatchedPath>()
        .map_or("unmatched", MatchedPath::as_str);

    let span = info_span!(
        "http_request",
        request_id,
        method = %request.method(),
        path,
        status = field::Empty,
        duration_ms = field::Empty,
    );
    let recorded = span.clone();

    async move {
        let started = Instant::now();
        let response = next.run(request).await;
        let status = response.status();
        let duration_ms = started.elapsed().as_millis();

        recorded.record("status", status.as_u16());
        recorded.record("duration_ms", duration_ms);

        // A 5xx is what axum produces from a handler `Err`, in place of tower's `on_failure`.
        if status.is_server_error() {
            error!(reason = status.as_u16(), "http request failed");
        } else {
            info!(status = status.as_u16(), "http request completed");
        }

        response
    }
    .instrument(span)
    .await
}

pub fn get_router(cors: CorsLayer, shared_state: Arc<WebState>) -> Router {
    // Internal Server-to-Server routes (Protected by Bearer INTERNAL_API_SECRET)
    let internal_routes = Router::new()
        .merge(reporting::routes())
        .merge(tickets::routes())
        .merge(reaction_roles::routes())
        .merge(general::routes())
        .merge(temp_voice::routes())
        .merge(moderation::routes())
        .merge(verification::routes())
        .merge(automod::routes())
        .merge(member_counter::routes())
        .merge(giveaways::routes())
        .merge(social_notifications::dashboard_routes())
        .route_layer(axum::middleware::from_fn_with_state(
            Arc::clone(&shared_state),
            require_internal_secret,
        ));

    // Real-time Browser routes (Protected by JWT)
    let realtime_routes = Router::new()
        .merge(live_feed::routes())
        .merge(music::routes());

    // Assemble API
    let api_routes = internal_routes.merge(realtime_routes);

    // Public WebSub callback (called by external hubs, verified via HMAC secret).
    // Mounted at root to match `{DOMAIN}/websub/{feed_id}` callbacks.
    let websub_routes = social_notifications::routes();

    Router::new()
        .route("/health", get(health_check))
        .merge(websub_routes)
        .nest("/api", api_routes)
        .fallback(handle_404)
        // `route_layer`, not `layer`: only the former runs once routing has matched, which is what
        // makes `MatchedPath` readable. The fallback is not a match, so it keeps its own line.
        .route_layer(axum::middleware::from_fn(http_trace))
        .layer(cors)
        .with_state(shared_state)
}
