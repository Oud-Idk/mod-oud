use crate::types::dashboard::{DashboardAction, DashboardCommand};
use crate::web::routes::commands::error::WebError;
use crate::web::routes::commands::{database, handlers};
use crate::WebState;
use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use std::sync::Arc;

async fn broadcast_report_update(
    pool: &PgPool,
    redis_conn: &mut redis::aio::MultiplexedConnection,
    report_id: i32,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let sse_update = database::get_reported_message_by_id(pool, report_id).await?;
    let sse_payload = serde_json::to_string(&sse_update)?;

    let _: () = redis::cmd("PUBLISH")
        .arg("discord:reports")
        .arg(&sse_payload)
        .query_async(redis_conn)
        .await?;

    Ok(())
}

pub async fn handle_dashboard_command(
    State(state): State<Arc<WebState>>,
    Json(cmd): Json<DashboardCommand>,
) -> Result<StatusCode, WebError> {
    let (guild_id, user_id) = database::fetch_target_report(&state.pool, cmd.report_id).await?;
    let mod_id_str = cmd.moderator_id.as_deref();

    // 1. Clone the persistent Redis multiplexed connection for our handlers
    let mut redis_conn = state.redis.clone(); // <-- $O(1)$ cheap clone

    match &cmd.action {
        DashboardAction::ResolveReport { status } => {
            handlers::handle_resolve_report(&state, &cmd, status, &guild_id, &mut redis_conn).await?;
        }
        DashboardAction::DeleteMessage { channel_id, message_id } => {
            handlers::handle_delete_message(&state, &cmd, channel_id, message_id).await?;
        }
        DashboardAction::WarnUser => {
            handlers::handle_warn(&state, &cmd, mod_id_str, &guild_id, &user_id, &mut redis_conn).await?;
        }
        DashboardAction::TimeoutUser => {
            handlers::handle_timeout(&state, &cmd, mod_id_str, &guild_id, &user_id, &mut redis_conn).await?;
        }
        DashboardAction::BanUser => {
            handlers::handle_ban_user(&state, &cmd, mod_id_str, &guild_id, &user_id, &mut redis_conn).await?;
        }
    }

    // 2. Pass our cloned connection for broadcasting updates
    broadcast_report_update(&state.pool, &mut redis_conn, cmd.report_id)
        .await
        .map_err(|e| WebError::Internal(e.to_string()))?;

    Ok(StatusCode::OK)
}