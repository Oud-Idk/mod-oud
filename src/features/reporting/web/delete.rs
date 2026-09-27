use crate::core::config::state::WebState;
use crate::features::reporting::database::update_reported_message;
use crate::features::reporting::types::{DashboardCommand, ReportUpdate};
use crate::features::reporting::web::error::WebError;
use axum::http::StatusCode;
use serenity::all::{ChannelId, MessageId};
use tracing::{info, instrument, warn};

#[instrument(skip(state), fields(report_id = cmd.report_id))]
pub async fn handle_delete_message(
    state: &WebState,
    cmd: &DashboardCommand,
    channel_id: ChannelId,
    message_id: MessageId,
) -> Result<StatusCode, WebError> {
    match state
        .serenity_http
        .delete_message(
            channel_id,
            message_id,
            Some("Deleted via Moderation Dashboard"),
        )
        .await
    {
        Ok(()) => {
            info!(%channel_id, %message_id, "message deleted via discord");
        }
        Err(poise::serenity_prelude::Error::Http(http_err)) => {
            if http_err.status_code().map(|s| s.as_u16()) == Some(404) {
                warn!("message already gone per the discord api");
            } else {
                warn!(error = %http_err, "message delete via discord failed");
                return Err(WebError::BadGateway("Message already deleted.".to_string()));
            }
        }
        Err(e) => {
            warn!(error = %e, "message delete failed");
            return Err(WebError::Internal);
        }
    }

    update_reported_message(&state.core.db, cmd.report_id, ReportUpdate::MessageDeleted).await?;
    Ok(StatusCode::OK)
}
