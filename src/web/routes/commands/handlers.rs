use crate::core::config::get_settings;
use crate::types::config::config::Format;
use crate::types::dashboard::{DashboardCommand, ReportUpdate};
use crate::types::payloads::ReportStatus;
use crate::utils::custom_msg::build_custom_message;
use crate::web::routes::commands::error::WebError;
use crate::web::routes::commands::{database, getters};
use crate::WebState;
use axum::http::StatusCode;
use fred::prelude::Client;
use serenity::all::{GuildId, UserId};
use tracing::{error, info, instrument, warn};

fn parse_id<T: std::str::FromStr>(val: &str, entity: &str) -> Result<T, WebError> {
    val.parse().map_err(|_| {
        warn!(entity_type = entity, raw_value = val, "Failed to parse entity ID");
        WebError::BadRequest(format!("Invalid {} ID", entity))
    })
}

#[instrument(skip(state), fields(report_id = cmd.report_id))]
pub async fn handle_delete_message(
    state: &WebState,
    cmd: &DashboardCommand,
    channel_id: &str,
    message_id: &str,
) -> Result<StatusCode, WebError> {
    let ch_id = parse_id(channel_id, "channel")?;
    let msg_id = parse_id(message_id, "message")?;

    info!(channel_id = %ch_id, message_id = %msg_id, "Attempting message deletion");

    match state.http.delete_message(ch_id, msg_id, Some("Deleted via Moderation Dashboard")).await {
        Ok(_) => {
            info!("Discord message deleted successfully");
        }
        Err(poise::serenity_prelude::Error::Http(http_err)) => {
            if http_err.status_code().map(|s| s.as_u16()) == Some(404) {
                warn!("Message already deleted (404) returned from Discord API");
            } else {
                error!(error = %http_err, "Failed to delete message via HTTP");
                return Err(WebError::BadGateway(format!("Discord API Error: {}", http_err)));
            }
        }
        Err(e) => {
            error!(error = %e, "Unexpected error deleting message");
            return Err(WebError::BadGateway(format!("Discord API Error: {}", e)));
        }
    }

    database::update_reported_message(&state.db, cmd.report_id, ReportUpdate::MessageDeleted).await?;
    Ok(StatusCode::OK)
}

#[instrument(skip(state, redis), fields(report_id = cmd.report_id, guild_id = %guild_id, user_id = %user_id
))]
pub async fn handle_warn(
    state: &WebState,
    cmd: &DashboardCommand,
    mod_id: Option<i64>,
    guild_id: &GuildId,
    user_id: &UserId,
    redis: &Client,
    moderator_username: &str,
    target_username: &str,
) -> Result<StatusCode, WebError> {
    let moderator_id = getters::resolve_moderator_id(&state.http, mod_id).await?;
    let reason_str = cmd.reason.as_deref().unwrap_or("No reason specified");

    info!(moderator_id = %moderator_id, "Issuing warning to user");

    crate::utils::moderation::issuing::issue_warning(
        &state.db,
        redis,
        &state.guild_configs,
        &state.http,
        *guild_id,
        *user_id,
        moderator_id,
        reason_str,
        moderator_username,
        target_username,
    )
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to execute warning issuance");
            WebError::Internal(e.to_string())
        })?;

    database::update_reported_message(&state.db, cmd.report_id, ReportUpdate::UserWarned).await?;
    Ok(StatusCode::OK)
}

#[instrument(skip(state, redis), fields(report_id = cmd.report_id, guild_id = %guild_id, user_id = %user_id
))]
pub async fn handle_timeout(
    state: &WebState,
    cmd: &DashboardCommand,
    mod_id: Option<i64>,
    guild_id: &GuildId,
    user_id: &UserId,
    redis: &Client,
) -> Result<StatusCode, WebError> {
    let duration_mins = cmd.duration_mins.ok_or_else(|| {
        warn!("Missing duration_mins parameter for timeout action");
        WebError::BadRequest("Missing duration_mins parameter".to_string())
    })?;

    info!(duration_minutes = duration_mins, "Issuing timeout to user");

    let (user, moderator) = tokio::try_join!(
        getters::resolve_target_user(&state.http, *user_id),
        getters::resolve_moderator_user(&state.http, mod_id)
    )?;

    let reason_str = cmd.reason.as_deref().unwrap_or("Timeout applied via Moderation Dashboard");

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();

    let future_secs = now_secs
        .checked_add(duration_mins * 60)
        .ok_or_else(|| {
            error!("Duration calculation overflowed during timeout window generation");
            WebError::BadRequest("Duration calculation overflowed".to_string())
        })?;

    let timestamp = poise::serenity_prelude::Timestamp::from_unix_timestamp(future_secs as i64)
        .map_err(|e| {
            error!(error = %e, "Failed to construct valid serenity Timestamp");
            WebError::Internal(e.to_string())
        })?;

    let duration = std::time::Duration::from_secs(duration_mins * 60);

    crate::utils::moderation::issuing::issue_mute(
        &state.db,
        redis,
        &state.guild_configs,
        &state.http,
        *guild_id,
        user,
        moderator,
        reason_str,
        &duration,
        timestamp,
    )
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to issue mute inside core utilities");
            WebError::Internal(format!("Failed to issue mute: {}", e))
        })?;

    database::update_reported_message(&state.db, cmd.report_id, ReportUpdate::UserTimedOut).await?;
    Ok(StatusCode::OK)
}

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
        getters::resolve_target_user(&state.http, *user_id),
        getters::resolve_moderator_user(&state.http, mod_id)
    )?;

    let reason_str = cmd.reason.as_deref().unwrap_or("No reason specified");
    let duration = cmd.duration_mins.map(|mins| std::time::Duration::from_secs(mins * 60));

    let duration_label = match cmd.duration_mins {
        Some(mins) if mins >= 1440 => format!("Temporary ({} days)", mins / 1440),
        Some(mins) if mins >= 60 => format!("Temporary ({} hours)", mins / 60),
        Some(mins) => format!("Temporary ({} minutes)", mins),
        None => "Permanent".to_string(),
    };

    crate::utils::moderation::issuing::issue_ban(
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
        .map_err(|e| {
            error!(error = %e, "Failed to complete ban operation");
            WebError::Internal(format!("Failed to issue ban: {}", e))
        })?;

    database::update_reported_message(&state.db, cmd.report_id, ReportUpdate::UserBanned).await?;
    Ok(StatusCode::OK)
}

#[instrument(skip(state, redis), fields(report_id = cmd.report_id, guild_id = %guild_id, status = ?status
))]
pub async fn handle_resolve_report(
    state: &WebState,
    cmd: &DashboardCommand,
    status: &ReportStatus,
    guild_id: &GuildId,
    redis: &Client,
) -> Result<StatusCode, WebError> {
    info!("Resolving report status and notifying reporter");

    let config = get_settings(&state.db, redis, &state.guild_configs, guild_id.get() as i64)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to resolve guild config");
            WebError::Internal(e.to_string())
        })?;

    let Some(report_config) = config.report else {
        warn!("Report config was missing for target guild during report resolution");
        return Ok(StatusCode::BAD_REQUEST);
    };

    let reporter_id: i64 = sqlx::query_scalar!(
        "SELECT reporter_id FROM reported_messages WHERE id = $1",
        cmd.report_id
    )
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to retrieve reporter ID from database");
            WebError::Internal(format!("Failed to fetch reporter ID: {}", e))
        })?;

    let reporter_id_u64: u64 = reporter_id as u64;
    let reporter_id = UserId::new(reporter_id_u64);

    database::update_reported_message(
        &state.db,
        cmd.report_id,
        ReportUpdate::Status(status.clone()),
    )
        .await
        .map_err(|(_status_code, err_msg)| {
            error!(error = %err_msg, "Database report status update failed");
            WebError::Internal(err_msg)
        })?;

    let dm_channel = reporter_id
        .create_dm_channel(&state.http)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to open direct message channel to the reporter");
            WebError::BadGateway(format!("Failed to open DM channel: {}", e))
        })?;

    let layout_opt = match status {
        ReportStatus::Actioned => report_config.resolved_dm.as_ref(),
        ReportStatus::Dismissed => report_config.dismissed_dm.as_ref(),
        ReportStatus::UnderReview => None,
    };

    if layout_opt.map(|l| l.enabled) != Some(true) {
        info!("Report status resolved; skipping DM layout dispatch since configurations are disabled");
        return Ok(StatusCode::OK);
    }

    let replace_fn = |s: &str| s.to_string();

    let custom_msg_builder = if let Some(layout) = layout_opt {
        build_custom_message(
            &layout.format,
            Some(&layout.content),
            layout.embed.as_ref(),
            replace_fn,
        )
            .map_err(|e| {
                error!(error = %e, "Failed to generate custom messaging content layout");
                WebError::Internal(format!("Failed to build custom message: {}", e))
            })?
    } else {
        None
    };

    let send_result = match custom_msg_builder {
        Some(builder) => {
            dm_channel.send_message(&state.http, builder).await
        }
        None => {
            let status_label = match status {
                ReportStatus::UnderReview => "Under Review",
                ReportStatus::Actioned => "Actioned",
                ReportStatus::Dismissed => "Dismissed",
            };
            let fallback_content = format!(
                "Hello! Your report (ID: {}) has been resolved. Status: **{}**",
                cmd.report_id, status_label
            );
            dm_channel.say(&state.http, fallback_content).await
        }
    };

    if let Err(e) = send_result {
        warn!(error = %e, %reporter_id, "Could not send resolution DM to reporter");
    } else {
        info!(%reporter_id, "Resolution DM successfully sent to reporter");
    }

    Ok(StatusCode::OK)
}