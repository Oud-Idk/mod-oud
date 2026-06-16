use crate::core::web::routes::commands::error::WebError;
use crate::core::web::routes::commands::{database, getters};
use crate::types::dashboard::{DashboardCommand, ReportUpdate};
use crate::WebState;
use axum::http::StatusCode;
use serenity::all::{GuildId, UserId};

fn parse_id<T: std::str::FromStr>(val: &str, entity: &str) -> Result<T, WebError> {
    val.parse().map_err(|_| WebError::BadRequest(format!("Invalid {} ID", entity)))
}

async fn get_redis_conn(redis: &redis::Client) -> Result<redis::aio::MultiplexedConnection, WebError> {
    redis.get_multiplexed_async_connection().await.map_err(Into::into)
}

pub async fn handle_delete_message(
    state: &WebState,
    cmd: &DashboardCommand,
    channel_id: &str,
    message_id: &str,
) -> Result<StatusCode, WebError> {
    let ch_id = parse_id(channel_id, "channel")?;
    let msg_id = parse_id(message_id, "message")?;

    match state.http.delete_message(ch_id, msg_id, Some("Deleted via Moderation Dashboard")).await {
        Ok(_) => {}
        Err(poise::serenity_prelude::Error::Http(http_err)) => {
            if http_err.status_code().map(|s| s.as_u16()) != Some(404) {
                return Err(WebError::BadGateway(format!("Discord API Error: {}", http_err)));
            }
        }
        Err(e) => return Err(WebError::BadGateway(format!("Discord API Error: {}", e))),
    }

    database::update_reported_message(&state.pool, cmd.report_id, ReportUpdate::MessageDeleted).await?;
    Ok(StatusCode::OK)
}

pub async fn handle_warn(
    state: &WebState,
    cmd: &DashboardCommand,
    mod_id_str: Option<&str>,
    guild_id: &GuildId,
    user_id: &UserId,
) -> Result<StatusCode, WebError> {
    let redis_conn = get_redis_conn(&state.redis_client).await?;
    let moderator_id = getters::resolve_moderator_id(&state.http, mod_id_str).await?;
    let reason_str = cmd.reason.as_deref().unwrap_or("No reason specified");

    crate::utils::moderating::issue_warning(
        &state.pool,
        &redis_conn,
        &state.http,
        *guild_id,
        *user_id,
        moderator_id,
        reason_str,
    )
        .await
        .map_err(|e| WebError::Internal(e.to_string()))?;

    database::update_reported_message(&state.pool, cmd.report_id, ReportUpdate::UserWarned).await?;
    Ok(StatusCode::OK)
}

pub async fn handle_timeout(
    state: &WebState,
    cmd: &DashboardCommand,
    mod_id_str: Option<&str>,
    guild_id: &GuildId,
    user_id: &UserId,
) -> Result<StatusCode, WebError> {
    let duration_mins = cmd.duration_mins.ok_or_else(|| {
        WebError::BadRequest("Missing duration_mins parameter".to_string())
    })?;

    let redis_conn = get_redis_conn(&state.redis_client).await?;

    // Concurrent fetch works automatically with `?` now
    let (user, moderator) = tokio::try_join!(
        getters::resolve_target_user(&state.http, *user_id),
        getters::resolve_moderator_user(&state.http, mod_id_str)
    )?;

    let reason_str = cmd.reason.as_deref().unwrap_or("Timeout applied via Moderation Dashboard");

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();

    let future_secs = now_secs
        .checked_add(duration_mins * 60)
        .ok_or_else(|| WebError::BadRequest("Duration calculation overflowed".to_string()))?;

    let timestamp = poise::serenity_prelude::Timestamp::from_unix_timestamp(future_secs as i64)
        .map_err(|e| WebError::Internal(e.to_string()))?;

    let duration = std::time::Duration::from_secs(duration_mins * 60);

    crate::utils::moderating::issue_mute(
        &state.pool,
        &redis_conn,
        &state.http,
        *guild_id,
        user,
        moderator,
        reason_str,
        &duration,
        timestamp,
    )
        .await
        .map_err(|e| WebError::Internal(format!("Failed to issue mute: {}", e)))?;

    database::update_reported_message(&state.pool, cmd.report_id, ReportUpdate::UserTimedOut).await?;
    Ok(StatusCode::OK)
}

pub async fn handle_ban_user(
    state: &WebState,
    cmd: &DashboardCommand,
    mod_id_str: Option<&str>,
    guild_id: &GuildId,
    user_id: &UserId,
) -> Result<StatusCode, WebError> {
    let redis_conn = get_redis_conn(&state.redis_client).await?;

    let (user, moderator) = tokio::try_join!(
        getters::resolve_target_user(&state.http, *user_id),
        getters::resolve_moderator_user(&state.http, mod_id_str)
    )?;

    let reason_str = cmd.reason.as_deref().unwrap_or("No reason specified");
    let duration = cmd.duration_mins.map(|mins| std::time::Duration::from_secs(mins * 60));

    let duration_label = match cmd.duration_mins {
        Some(mins) if mins >= 1440 => format!("Temporary ({} days)", mins / 1440),
        Some(mins) if mins >= 60 => format!("Temporary ({} hours)", mins / 60),
        Some(mins) => format!("Temporary ({} minutes)", mins),
        None => "Permanent".to_string(),
    };

    crate::utils::moderating::issue_ban(
        &state.pool,
        &redis_conn,
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
        .map_err(|e| WebError::Internal(format!("Failed to issue ban: {}", e)))?;

    database::update_reported_message(&state.pool, cmd.report_id, ReportUpdate::UserBanned).await?;
    Ok(StatusCode::OK)
}