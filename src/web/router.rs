use std::sync::Arc;
use axum::http::{Method, StatusCode, Uri};
use axum::Router;
use axum::routing::get;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::{debug, instrument};
use crate::core::config::state::WebState;
use crate::features::{automod, general, giveaways, live_feed, member_counter, moderation, music, reaction_roles, reporting, temp_voice, tickets, verification};

#[instrument]
async fn health_check() -> &'static str {
    debug!("Health check endpoint called");
    "OK"
}

#[instrument]
async fn handle_404(method: Method, uri: Uri) -> (StatusCode, &'static str) {
    debug!(
        method = %method,
        uri = %uri,
        "404 Not Found"
    );
    (StatusCode::NOT_FOUND, "Not Found. Meow :3")
}

pub fn get_router(cors: CorsLayer, shared_state: Arc<WebState>) -> Router {
    let api_routes = Router::new()
        .merge(live_feed::routes())
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
        .merge(music::routes());

    Router::new()
        .route("/health", get(health_check))
        .nest("/api", api_routes)
        .fallback(handle_404)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(shared_state)
}