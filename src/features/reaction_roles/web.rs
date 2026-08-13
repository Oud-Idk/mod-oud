use std::sync::Arc;
use axum::Router;
use axum::routing::{delete, post};
use crate::core::config::state::WebState;
use crate::features::reaction_roles::web::delete::handle_delete_reaction_role_message;
use crate::features::reaction_roles::web::edit::handle_edit_reaction_role_message;
use crate::features::reaction_roles::web::send::handle_send_reaction_role_message;

mod helpers;
pub mod delete;
pub mod edit;
pub mod send;

pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/guilds/{guild_id}/reaction-roles/{config_id}/send", post(handle_send_reaction_role_message))
        .route("/guilds/{guild_id}/reaction-roles/{config_id}/edit", post(handle_edit_reaction_role_message))
        .route("/guilds/{guild_id}/reaction-roles/{config_id}/message", delete(handle_delete_reaction_role_message))
}