use std::sync::Arc;
use axum::Router;
use axum::routing::post;
use crate::core::config::state::WebState;
use crate::features::tickets::web::delete_panel::handle_delete_ticket_message;
use crate::features::tickets::web::send_panel::handle_send_ticket_message;

pub mod send_panel;
pub mod delete_panel;

pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/guilds/{guild_id}/tickets/send-message", post(handle_send_ticket_message))
        .route("/guilds/{guild_id}/tickets/delete-message", post(handle_delete_ticket_message))
}