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
use tracing::{warn, info, debug, instrument};

/// Converts a dashboard-supplied minute count to seconds. The value arrives as JSON, so the
/// multiply is checked: unchecked it wraps in release, which would put a timeout's expiry in the
/// past and lift the timeout the moment it was applied.
fn duration_secs(mins: u64) -> Result<u64, WebError> {
    mins.checked_mul(60).ok_or_else(|| {
        debug!(mins, "dashboard duration out of range; rejecting the command");
        WebError::BadRequest("Duration calculation overflowed".to_string())
    })
}

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
    let (guild_id, user_id, target_username) =
        reporting::database::fetch_target_report(&state.core.db, cmd.report_id)
            .await
            .inspect_err(|(status, err_msg)| {
                // A miss is the caller's id being wrong (404); only our own failure is 5xx.
                if status.is_client_error() {
                    debug!(
                        status = %status,
                        error = %err_msg,
                        "rejected report lookup for the requested report id"
                    );
                } else {
                    warn!(
                        status = %status,
                        error = %err_msg,
                        "target report lookup failed"
                    );
                }
            })?;

    let redis_conn = state.core.redis.clone();
    let moderator_name = cmd.name.as_deref().unwrap_or("Web Dashboard");
    let moderator_id = cmd.moderator_id;

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
                    target_username: &target_username,
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
        warn!(error = ?e, "dashboard report update broadcast failed");
        return Err(WebError::Internal);
    }

    info!(
        report_id = cmd.report_id,
        moderator_id = ?moderator_id,
        action = ?cmd.action,
        "dashboard moderation command applied and broadcast"
    );
    Ok(StatusCode::OK)
}

/// Registers the reporting web route for dashboard moderation commands.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new().route("/commands", post(handle_dashboard_command))
}

#[cfg(test)]
mod tests {
    use super::duration_secs;

    /// A minute count whose unchecked multiply wraps to 44 seconds, so a timeout would have
    /// expired almost as soon as it was applied.
    const WRAPPING_MINS: u64 = 307_445_734_561_825_861;

    #[test]
    fn rejects_a_duration_whose_multiply_would_wrap() {
        assert_eq!(WRAPPING_MINS.wrapping_mul(60), 44);
        assert!(duration_secs(WRAPPING_MINS).is_err());
        assert!(duration_secs(u64::MAX).is_err());
    }

    #[test]
    fn converts_durations_a_moderator_would_actually_send() {
        assert_eq!(duration_secs(0).ok(), Some(0));
        assert_eq!(duration_secs(10).ok(), Some(600));
        // Discord's longest timeout is 28 days.
        assert_eq!(duration_secs(28 * 24 * 60).ok(), Some(2_419_200));
    }
}
