use crate::core::config::state::WebState;
use crate::core::config::settings::get_settings;
use crate::features::reporting::database::update_reported_message;
use crate::features::reporting::types::ReportStatus;
use crate::features::reporting::types::{DashboardCommand, ReportUpdate};
use crate::features::reporting::web::error::WebError;
use crate::shared::embed::build_custom_message;
use axum::http::StatusCode;
use fred::clients::Client;
use serenity::all::{GuildId, UserId};
use tracing::{error, info, instrument, warn};

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

    update_reported_message(
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