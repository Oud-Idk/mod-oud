use crate::commands::messages::database::publish_report;
use crate::types::dashboard::{DashboardAction, DashboardCommand};
use crate::web::routes::commands::error::WebError;
use crate::web::routes::commands::{database, handlers};
use crate::WebState;
use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use fred::clients::Client;
use sqlx::PgPool;
use std::sync::Arc;

async fn broadcast_report_update(
    pool: &PgPool,
    redis_conn: &Client,
    report_id: i32,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let sse_update = database::get_reported_message_by_id(pool, report_id).await?;
    let sse_payload = serde_json::to_string(&sse_update)?;

    publish_report(redis_conn, &sse_payload).await?;

    Ok(())
}

pub async fn handle_dashboard_command(
    State(state): State<Arc<WebState>>,
    Json(cmd): Json<DashboardCommand>,
) -> Result<StatusCode, WebError> {
    let (guild_id, user_id) = database::fetch_target_report(&state.pool, cmd.report_id).await?;
    let mod_id_str = cmd.moderator_id.as_deref();

    let mut redis_conn = state.redis.clone();

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

    broadcast_report_update(&state.pool, &mut redis_conn, cmd.report_id)
        .await
        .map_err(|e| WebError::Internal(e.to_string()))?;

    Ok(StatusCode::OK)
}