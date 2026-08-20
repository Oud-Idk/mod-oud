use crate::core::config::state::WebState;
use crate::features::moderation::issue_mute;
use crate::features::reporting::database::update_reported_message;
use crate::features::reporting::types::{DashboardCommand, ReportUpdate};
use crate::features::reporting::web::error::WebError;
use crate::features::reporting::web::user_lookup::{resolve_moderator_user, resolve_target_user};
use axum::http::StatusCode;
use fred::clients::Client;
use serenity::all::{GuildId, UserId};
use tracing::{error, info, instrument, warn};

#[instrument(skip(state, redis), fields(report_id = cmd.report_id, %guild_id, user_id = %user_id
))]
pub async fn handle_timeout(
    state: &WebState,
    cmd: &DashboardCommand,
    mod_id: Option<UserId>,
    guild_id: GuildId,
    user_id: UserId,
    redis: &Client,
) -> Result<StatusCode, WebError> {
    let duration_mins = cmd.duration_mins.ok_or_else(|| {
        warn!("Missing duration_mins parameter for timeout action");
        WebError::BadRequest("Missing duration_mins parameter".to_string())
    })?;

    info!(duration_minutes = duration_mins, "Issuing timeout to user");

    let (user, moderator) = tokio::try_join!(
        resolve_target_user(&state.serenity_http, user_id),
        resolve_moderator_user(&state.serenity_http, mod_id)
    )?;

    let reason_str = cmd
        .reason
        .as_deref()
        .unwrap_or("Timeout applied via Moderation Dashboard");

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();

    let future_secs = now_secs.checked_add(duration_mins * 60).ok_or_else(|| {
        error!("Duration calculation overflowed during timeout window generation");
        WebError::BadRequest("Duration calculation overflowed".to_string())
    })?;

    let timestamp = poise::serenity_prelude::Timestamp::from_unix_timestamp(
        i64::try_from(future_secs).unwrap_or(i64::MAX),
    )
    .inspect_err(|e| error!(error = %e, "Failed to construct valid serenity Timestamp"))
    .map_err(|_e| WebError::Internal)?;

    let duration = std::time::Duration::from_secs(duration_mins * 60);

    issue_mute(
        &state.core.db,
        redis,
        &state.core.guild_configs_cache,
        &state.serenity_http,
        guild_id,
        user,
        moderator,
        reason_str,
        &duration,
        timestamp,
    )
    .await
    .inspect_err(|e| error!(error = %e, "Failed to issue mute inside core utilities"))
    .map_err(|_e| WebError::Internal)?;

    update_reported_message(&state.core.db, cmd.report_id, ReportUpdate::UserTimedOut).await?;
    Ok(StatusCode::OK)
}
