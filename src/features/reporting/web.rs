use crate::core::config::state::WebState;
use crate::features::reporting;
use crate::features::reporting::cache::publish_report;
use crate::features::reporting::moderation::{
    ActionError, ActionRequest, ReportDeps, ban_user, delete_message, settle, timeout_user,
    warn_user,
};
use crate::features::reporting::types::{DashboardAction, DashboardCommand};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use fred::clients::Client;
use std::sync::Arc;
use tracing::{debug, info, instrument, warn};

/// The fallback recorded against a dashboard action whose dashboard did not name the moderator.
const UNKNOWN_MODERATOR: &str = "Web Dashboard";

/// The failure of a dashboard route. The action layer reports what went wrong in its own words,
/// so the mapping here only has to choose a status.
pub enum WebError {
    NotFound,
    BadRequest(String),
    Internal,
    BadGateway(String),
}

impl IntoResponse for WebError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            Self::NotFound => (StatusCode::NOT_FOUND, "Report not found".to_string()),
            Self::BadRequest(s) => (StatusCode::BAD_REQUEST, s),
            Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal server error".to_string(),
            ),
            Self::BadGateway(s) => (StatusCode::BAD_GATEWAY, s),
        };
        (status, msg).into_response()
    }
}

impl From<ActionError> for WebError {
    fn from(err: ActionError) -> Self {
        match err {
            ActionError::NotFound => Self::NotFound,
            ActionError::InvalidInput(msg) => Self::BadRequest(msg),
            ActionError::Discord(msg) => Self::BadGateway(msg),
            ActionError::Internal => Self::Internal,
        }
    }
}

async fn broadcast_report_update(
    pool: &sqlx::PgPool,
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
    let (guild_id, user_id, target_username) =
        reporting::database::fetch_target_report(&state.core.db, cmd.report_id)
            .await
            .inspect_err(|err| {
                // A miss is the dashboard's id being wrong; only our own failure is 5xx.
                if matches!(err, ActionError::NotFound) {
                    debug!(
                        report_id = cmd.report_id,
                        "rejected lookup for an unknown report id"
                    );
                } else {
                    warn!(report_id = cmd.report_id, error = %err, "target report lookup failed");
                }
            })?;

    let redis_conn = state.core.redis.clone();
    let moderator_name = cmd.name.as_deref().unwrap_or(UNKNOWN_MODERATOR);
    let deps = ReportDeps {
        core: &state.core,
        http: &state.serenity_http,
    };

    let request = ActionRequest {
        report_id: cmd.report_id,
        guild_id,
        target_id: user_id,
        moderator_id: cmd.moderator_id,
        moderator_name,
        target_name: &target_username,
        reason: cmd.reason.as_deref(),
        duration_mins: cmd.duration_mins,
    };

    match &cmd.action {
        DashboardAction::ResolveReport { status } => {
            settle(&deps, &request, *status).await?;
        }
        DashboardAction::DeleteMessage {
            channel_id,
            message_id,
        } => {
            delete_message(
                &deps,
                &request,
                *channel_id,
                *message_id,
                "Deleted via Moderation Dashboard",
            )
            .await?;
        }
        DashboardAction::WarnUser => warn_user(&deps, &request).await?,
        DashboardAction::TimeoutUser => timeout_user(&deps, &request).await?,
        DashboardAction::BanUser => ban_user(&deps, &request).await?,
    }

    if let Err(e) = broadcast_report_update(&state.core.db, &redis_conn, cmd.report_id).await {
        warn!(error = ?e, "dashboard report update broadcast failed");
        return Err(WebError::Internal);
    }

    info!(
        report_id = cmd.report_id,
        moderator_id = ?cmd.moderator_id,
        action = ?cmd.action,
        "dashboard moderation command applied and broadcast"
    );
    Ok(StatusCode::OK)
}

/// Registers the reporting web route for dashboard moderation commands.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new().route("/commands", post(handle_dashboard_command))
}
