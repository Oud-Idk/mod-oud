use crate::core::config::settings::get_settings;
use crate::core::config::state::WebState;
use crate::features::reporting::database::{fetch_reporter_id, update_reported_message};
use crate::features::reporting::types::ReportStatus;
use crate::features::reporting::types::{DashboardCommand, ReportUpdate};
use crate::features::reporting::web::error::WebError;
use crate::shared::embed::build_custom_message;
use axum::http::StatusCode;
use fred::clients::Client;
use serenity::all::GuildId;
use tracing::{error, info, instrument, warn};

#[instrument(skip(state, redis), fields(report_id = cmd.report_id, %guild_id, status = ?status
))]
pub async fn handle_resolve_report(
    state: &WebState,
    cmd: &DashboardCommand,
    status: &ReportStatus,
    guild_id: GuildId,
    redis: &Client,
) -> Result<StatusCode, WebError> {
    info!("Resolving report status and notifying reporter");

    let config = get_settings(
        &state.core.db,
        redis,
        &state.core.guild_configs_cache,
        guild_id,
    )
    .await
    .inspect_err(|e| error!(error = %e, "Failed to resolve guild config"))
    .map_err(|_| WebError::Internal)?;

    let Some(report_config) = config.report else {
        warn!("Report config was missing for target guild during report resolution");
        return Ok(StatusCode::BAD_REQUEST);
    };

    let reporter_id = fetch_reporter_id(&state.core.db, cmd.report_id).await?;

    update_reported_message(&state.core.db, cmd.report_id, ReportUpdate::Status(*status))
        .await
        .inspect_err(|e| error!(error = ?e, "Database report status update failed"))
        .map_err(|_| WebError::Internal)?;

    let dm_channel = reporter_id
        .create_dm_channel(&state.serenity_http)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to open direct message channel to the reporter");
            WebError::BadGateway(format!("Failed to open DM channel: {e}"))
        })?;

    let layout_opt = match status {
        ReportStatus::Actioned => report_config.resolved_dm.as_ref(),
        ReportStatus::Dismissed => report_config.dismissed_dm.as_ref(),
        ReportStatus::UnderReview => None,
    };

    if layout_opt.is_none_or(|l| !l.enabled) {
        info!(
            "Report status resolved; skipping DM layout dispatch since configurations are disabled"
        );
        return Ok(StatusCode::OK);
    }

    let replace_fn = |s: &str| s.to_string();

    let custom_msg_builder = if let Some(layout) = layout_opt {
        build_custom_message(
            layout.message.format,
            &layout.message.content,
            &layout.message.embed,
            replace_fn,
        )
        .inspect_err(|e| error!(error = %e, "Failed to generate custom messaging content layout"))
        .map_err(|_e| WebError::Internal)?
    } else {
        None
    };

    let send_result = if let Some(builder) = custom_msg_builder {
        dm_channel.send_message(&state.serenity_http, builder).await
    } else {
        let status_label = match status {
            ReportStatus::UnderReview => "Under Review",
            ReportStatus::Actioned => "Actioned",
            ReportStatus::Dismissed => "Dismissed",
        };
        let fallback_content = format!(
            "Hello! Your report (ID: {}) has been resolved. Status: **{}**",
            cmd.report_id, status_label
        );
        dm_channel.say(&state.serenity_http, fallback_content).await
    };

    if let Err(e) = send_result {
        warn!(error = %e, %reporter_id, "Could not send resolution DM to reporter");
    } else {
        info!(%reporter_id, "Resolution DM successfully sent to reporter");
    }

    Ok(StatusCode::OK)
}
