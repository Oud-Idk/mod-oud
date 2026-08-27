mod ban;
mod delete;
mod error;
mod resolve;
mod timeout;
mod user_lookup;
mod warn;

use crate::core::config::state::WebState;
use crate::features::reporting;
use crate::features::reporting::cache::publish_report;
use crate::features::reporting::types::{DashboardAction, DashboardCommand};
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use error::WebError;
use fred::clients::Client;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{error, info, instrument};

async fn broadcast_report_update(
    pool: &PgPool,
    redis_conn: &Client,
    report_id: i64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let sse_update = reporting::database::get_reported_message_by_id(pool, report_id).await?;
    let sse_payload = serde_json::to_string(&sse_update)?;

    publish_report(redis_conn, &sse_payload).await?;

    Ok(())
}

#[instrument(skip(state), fields(report_id = cmd.report_id, action = ?cmd.action))]
pub async fn handle_dashboard_command(
    State(state): State<Arc<WebState>>,
    Json(cmd): Json<DashboardCommand>,
) -> Result<StatusCode, WebError> {
    let (guild_id, user_id) =
        reporting::database::fetch_target_report(&state.core.db, cmd.report_id)
            .await
            .inspect_err(|(status, err_msg)| {
                error!(
                    status = %status,
                    error = %err_msg,
                    "Failed to fetch target report details from database"
                );
            })?;

    let redis_conn = state.core.redis.clone();
    let moderator_name = cmd.name.as_deref().unwrap_or("Web Dashboard");
    let moderator_id = cmd.moderator_id;

    info!(
        moderator_name = moderator_name,
        "Processing dashboard moderation command"
    );

    match &cmd.action {
        DashboardAction::ResolveReport { status } => {
            resolve::handle_resolve_report(&state, &cmd, status, guild_id, &redis_conn).await?;
        }
        DashboardAction::DeleteMessage {
            channel_id,
            message_id,
        } => {
            delete::handle_delete_message(&state, &cmd, *channel_id, *message_id).await?;
        }
        DashboardAction::WarnUser => {
            warn::handle_warn(
                &state,
                &cmd,
                warn::WarnContext {
                    mod_id: moderator_id,
                    guild_id,
                    user_id,
                    redis: &redis_conn,
                    moderator_username: moderator_name,
                    target_username: None,
                },
            )
            .await?;
        }
        DashboardAction::TimeoutUser => {
            timeout::handle_timeout(&state, &cmd, moderator_id, guild_id, user_id, &redis_conn)
                .await?;
        }
        DashboardAction::BanUser => {
            ban::handle_ban_user(&state, &cmd, moderator_id, guild_id, user_id, &redis_conn)
                .await?;
        }
    }

    if let Err(e) = broadcast_report_update(&state.core.db, &redis_conn, cmd.report_id).await {
        error!(error = ?e, "Failed to broadcast report update after moderation action");
        return Err(WebError::Internal);
    }

    info!("Dashboard moderation command executed successfully");
    Ok(StatusCode::OK)
}

/// Registers the reporting web route for dashboard moderation commands.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new().route("/commands", post(handle_dashboard_command))
}
