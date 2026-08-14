use std::sync::Arc;
use axum::Router;
use axum::routing::{delete, post};
use crate::core::config::state::WebState;

mod helpers;
mod send;
mod delete;
mod edit;


/// Registers the giveaway web routes for sending, editing, and deleting giveaway messages.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/guilds/{guild_id}/giveaways/{config_id}/send", post(send::handle_send_giveaway_message))
        .route("/guilds/{guild_id}/giveaways/{config_id}/edit", post(edit::handle_edit_giveaway_message))
        .route("/guilds/{guild_id}/giveaways/{config_id}/message", delete(delete::handle_delete_giveaway_message))
}