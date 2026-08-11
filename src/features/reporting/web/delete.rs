use crate::core::config::state::WebState;
use crate::features::reporting::database::update_reported_message;
use crate::features::reporting::types::{DashboardCommand, ReportUpdate};
use crate::features::reporting::web::error::WebError;
use axum::http::StatusCode;
use serenity::all::{ChannelId, MessageId};
use tracing::{error, info, instrument, warn};

#[instrument(skip(state), fields(report_id = cmd.report_id))]
pub async fn handle_delete_message(
    state: &WebState,
    cmd: &DashboardCommand,
    channel_id: &u64,
    message_id: &u64,
) -> Result<StatusCode, WebError> {
    let ch_id = ChannelId::from(*channel_id);
    let msg_id = MessageId::from(*message_id);

    info!(channel_id = %ch_id, message_id = %msg_id, "Attempting message deletion");

    match state.serenity_http.delete_message(ch_id, msg_id, Some("Deleted via Moderation Dashboard")).await {
        Ok(_) => {
            info!("Discord message deleted successfully");
        }
        Err(poise::serenity_prelude::Error::Http(http_err)) => {
            if http_err.status_code().map(|s| s.as_u16()) == Some(404) {
                warn!("Message already deleted (404) returned from Discord API");
            } else {
                error!(error = %http_err, "Failed to delete message via HTTP");
                return Err(WebError::BadGateway("Message already deleted.".to_string()));
            }
        }
        Err(e) => {
            error!(error = %e, "Unexpected error deleting message");
            return Err(WebError::Internal);
        }
    }

    update_reported_message(&state.core.db, cmd.report_id, ReportUpdate::MessageDeleted).await?;
    Ok(StatusCode::OK)
}