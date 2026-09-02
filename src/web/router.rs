use crate::core::config::state::WebState;
use crate::features::{
    automod, general, giveaways, live_feed, member_counter, moderation, music, reaction_roles,
    reporting, temp_voice, tickets, verification,
};
use axum::Router;
use axum::http::{Method, StatusCode, Uri};
use axum::routing::get;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::{debug, instrument};

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
        .route_layer(axum::middleware::from_fn_with_state(
            Arc::clone(&shared_state),
            crate::web::middleware::require_internal_secret,
        ));

    // Real-time Browser routes (Protected by JWT)
    let realtime_routes = Router::new()
        .merge(live_feed::routes())
        .merge(music::routes());

    // Assemble API
    let api_routes = internal_routes.merge(realtime_routes);

    Router::new()
        .route("/health", get(health_check))
        .nest("/api", api_routes)
        .fallback(handle_404)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(shared_state)
}