use std::sync::Arc;
use axum::Router;
use axum::routing::{delete, post};
use crate::core::config::state::WebState;
use crate::features::verification::web::setup::handle_verification_setup;
use crate::features::verification::web::teardown::handle_verification_teardown;
use crate::features::verification::web::verify::handle_verify;

pub mod setup;
pub(crate) mod teardown;
pub(crate) mod verify;

pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/guilds/{guild_id}/verification", post(handle_verification_setup))
        .route("/guilds/{guild_id}/verification", delete(handle_verification_teardown))
        .route("/verify", post(handle_verify))
}