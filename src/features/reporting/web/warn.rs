use crate::core::config::state::WebState;
use crate::features::reporting::database::update_reported_message;
use crate::features::reporting::types::{DashboardCommand, ReportUpdate};
use crate::features::reporting::web::error::WebError;
use crate::features::reporting::web::user_lookup;
use crate::features::warning::issue_warning;
use axum::http::StatusCode;
use fred::clients::Client;
use serenity::all::{GuildId, UserId};
use tracing::{error, info, instrument};

#[instrument(skip(state, redis), fields(report_id = cmd.report_id, %guild_id, user_id = %user_id
))]
pub async fn handle_warn(
    state: &WebState,
    cmd: &DashboardCommand,
    mod_id: Option<UserId>,
    guild_id: GuildId,
    user_id: UserId,
    redis: &Client,
    moderator_username: &str,
    target_username: &str,
) -> Result<StatusCode, WebError> {
    let moderator_id = user_lookup::resolve_moderator_id(&state.serenity_http, mod_id).await?;
    let reason_str = cmd.reason.as_deref().unwrap_or("No reason specified");

    info!(moderator_id = %moderator_id, "Issuing warning to user");

    issue_warning(
        &state.core.db,
        redis,
        &state.core.guild_configs_cache,
        &state.core.username_tx,
        &state.serenity_http,
        guild_id,
        user_id,
        moderator_id,
        reason_str,
        moderator_username,
        target_username,
    )
    .await
    .inspect_err(|e| error!(error = %e, "Failed to execute warning issuance"))
    .map_err(|_e| WebError::Internal)?;

    update_reported_message(&state.core.db, cmd.report_id, ReportUpdate::UserWarned).await?;
    Ok(StatusCode::OK)
}
