use std::sync::Arc;
use axum::Router;
use axum::routing::post;
use crate::core::config::state::WebState;
use crate::features::temp_voice::web::create_hub::handle_create_temp_category_and_hub;
use crate::features::temp_voice::web::send_interface::handle_send_temp_voice_interface;

pub mod send_interface;
pub mod create_hub;

pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/guilds/{guild_id}/temp-voice/setup", post(handle_create_temp_category_and_hub))
        .route("/guilds/{guild_id}/temp-voice/interface/setup", post(handle_send_temp_voice_interface))
}