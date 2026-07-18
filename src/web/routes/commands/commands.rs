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
use tracing::{error, info, instrument};

async fn broadcast_report_update(
    pool: &PgPool,
    redis_conn: &Client,
    report_id: i64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let sse_update = database::get_reported_message_by_id(pool, report_id).await?;
    let sse_payload = serde_json::to_string(&sse_update)?;

    publish_report(redis_conn, &sse_payload).await?;

    Ok(())
}

#[instrument(skip(state), fields(report_id = cmd.report_id, action = ?cmd.action))]
pub async fn handle_dashboard_command(
    State(state): State<Arc<WebState>>,
    Json(cmd): Json<DashboardCommand>,
) -> Result<StatusCode, WebError> {
    let (guild_id, user_id, target_username) = database::fetch_target_report(&state.pool, cmd.report_id)
        .await
        .map_err(|(status, err_msg)| {
            error!(
                status = %status,
                error = %err_msg,
                "Failed to fetch target report details from database"
            );
            (status, err_msg)
        })?;

    let redis_conn = state.redis.clone();
    let moderator_name = cmd.name.as_deref().unwrap_or("Web Dashboard");
    let moderator_id = cmd.moderator_id;

    info!(moderator_name = moderator_name, "Processing dashboard moderation command");

    match &cmd.action {
        DashboardAction::ResolveReport { status } => {
            handlers::handle_resolve_report(&state, &cmd, status, &guild_id, &redis_conn).await?;
        }
        DashboardAction::DeleteMessage { channel_id, message_id } => {
            handlers::handle_delete_message(&state, &cmd, channel_id, message_id).await?;
        }
        DashboardAction::WarnUser => {
            handlers::handle_warn(
                &state,
                &cmd,
                moderator_id,
                &guild_id,
                &user_id,
                &redis_conn,
                &moderator_name,
                &target_username
            ).await?;
        }
        DashboardAction::TimeoutUser => {
            handlers::handle_timeout(&state, &cmd, moderator_id, &guild_id, &user_id, &redis_conn).await?;
        }
        DashboardAction::BanUser => {
            handlers::handle_ban_user(&state, &cmd, moderator_id, &guild_id, &user_id, &redis_conn).await?;
        }
    }

    if let Err(e) = broadcast_report_update(&state.pool, &redis_conn, cmd.report_id).await {
        error!(error = ?e, "Failed to broadcast report update after moderation action");
        return Err(WebError::Internal(e.to_string()));
    }

    info!("Dashboard moderation command executed successfully");
    Ok(StatusCode::OK)
}