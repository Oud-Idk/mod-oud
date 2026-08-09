use crate::core::config::state::WebState;
use crate::features::moderation::issue_ban;
use crate::features::reporting::database::update_reported_message;
use crate::features::reporting::types::{DashboardCommand, ReportUpdate};
use crate::features::reporting::web::error::WebError;
use crate::features::reporting::web::user_lookup::{resolve_moderator_user, resolve_target_user};
use axum::http::StatusCode;
use fred::clients::Client;
use serenity::all::{GuildId, UserId};
use tracing::{error, info, instrument};

#[instrument(skip(state, redis), fields(report_id = cmd.report_id, guild_id = %guild_id, user_id = %user_id
))]
pub async fn handle_ban_user(
    state: &WebState,
    cmd: &DashboardCommand,
    mod_id: Option<i64>,
    guild_id: &GuildId,
    user_id: &UserId,
    redis: &Client,
) -> Result<StatusCode, WebError> {
    info!("Issuing ban to user");

    let (user, moderator) = tokio::try_join!(
        resolve_target_user(&state.http, *user_id),
        resolve_moderator_user(&state.http, mod_id)
    )?;

    let reason_str = cmd.reason.as_deref().unwrap_or("No reason specified");
    let duration = cmd.duration_mins.map(|mins| std::time::Duration::from_secs(mins * 60));

    let duration_label = match cmd.duration_mins {
        Some(mins) if mins >= 1440 => format!("Temporary ({} days)", mins / 1440),
        Some(mins) if mins >= 60 => format!("Temporary ({} hours)", mins / 60),
        Some(mins) => format!("Temporary ({} minutes)", mins),
        None => "Permanent".to_string(),
    };

    issue_ban(
        &state.db,
        redis,
        &state.guild_configs,
        &state.http,
        *guild_id,
        user,
        moderator,
        reason_str,
        7,
        duration,
        &duration_label,
    )
        .await
        .inspect_err(|e| error!(error = %e, "Failed to complete ban operation"))
        .map_err(|e| WebError::Internal)?;

    update_reported_message(&state.db, cmd.report_id, ReportUpdate::UserBanned).await?;
    Ok(StatusCode::OK)
}