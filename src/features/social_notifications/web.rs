use crate::core::config::state::WebState;
use crate::features::social_notifications::web::dashboard::create_feed_subscription;
use crate::features::social_notifications::web::websub::{websub_notify, websub_verify};
use axum::Router;
use axum::routing::{get, post};
use std::sync::Arc;

mod dashboard;
mod websub;

/// Registers the public `WebSub` routes for notifications.
///
/// Kept separate from [`dashboard_routes`] because these are mounted at the site
/// root and authenticate with a per-feed HMAC signature, not the internal secret.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new().route("/websub/{feed_id}", get(websub_verify).post(websub_notify))
}

/// Internal dashboard routes, mounted under `/api` behind the internal secret.
pub fn dashboard_routes() -> Router<Arc<WebState>> {
    Router::new().route(
        "/guilds/{guild_id}/rss/feeds",
        post(create_feed_subscription),
    )
}
