use crate::core::config::state::WebState;
use crate::features::temp_voice::web::create_hub::handle_create_temp_category_and_hub;
use crate::features::temp_voice::web::send_interface::handle_send_temp_voice_interface;
use axum::Router;
use axum::routing::post;
use std::sync::Arc;

pub mod create_hub;
pub mod send_interface;

/// Returns the axum router exposing the temporary voice hub and interface setup web endpoints.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route(
            "/guilds/{guild_id}/temp-voice/setup",
            post(handle_create_temp_category_and_hub),
        )
        .route(
            "/guilds/{guild_id}/temp-voice/interface/setup",
            post(handle_send_temp_voice_interface),
        )
}
