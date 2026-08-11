use crate::core::config::state::WebState;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serenity::all::{ChannelId, EditRole, GuildId, Permissions, RoleId};
use std::sync::Arc;
use serde_with::{serde_as, DisplayFromStr};
use tracing::warn;

#[serde_as]
#[derive(Deserialize, Clone, Debug)]
pub struct TeardownVerificationRequest {
    #[serde_as(as = "DisplayFromStr")]
    verification_channel_id: u64,
    #[serde_as(as = "DisplayFromStr")]
    verification_role_id: u64,
}

pub async fn handle_verification_teardown(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<TeardownVerificationRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let http = &state.serenity_http;

    let guild_id_u64 = guild_id_str
        .parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, guild_id_str = guild_id_str, "Failed to parse guild ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid guild ID".to_string()))?;
    let guild_id = GuildId::from(guild_id_u64);

    let channel_id = ChannelId::from(payload.verification_channel_id);
    let role_id = RoleId::from(payload.verification_role_id);

    let mut execution_errors = Vec::new();

    if let Err(e) = channel_id.delete(http).await {
        if !is_not_found_error(&e) {
            warn!(error = ?e, channel_id = channel_id.get(), "Failed to delete channel during teardown");
            execution_errors.push("Failed to delete verification channel".to_string());
        }
    }

    if let Err(e) = guild_id.delete_role(http, role_id).await {
        if !is_not_found_error(&e) {
            warn!(error = ?e, role_id = role_id.get(), "Failed to delete role during teardown");
            execution_errors.push("Failed to delete verification role".to_string());
        }
    }

    let everyone_role_id = RoleId::from(guild_id.get());
    match guild_id.roles(http).await {
        Ok(roles) => {
            if let Some(everyone_role) = roles.get(&everyone_role_id) {
                let mut restored_permissions = everyone_role.permissions;
                restored_permissions.insert(Permissions::VIEW_CHANNEL);

                let edit_builder = EditRole::new().permissions(restored_permissions);
                if let Err(e) = guild_id.edit_role(http, everyone_role_id, edit_builder).await {
                    warn!(error = ?e, "Failed to restore @everyone permissions during teardown");
                    execution_errors.push("Failed to restore @everyone permissions".to_string());
                }
            } else {
                warn!("Could not find @everyone role during teardown");
                execution_errors.push("Could not locate @everyone role".to_string());
            }
        }
        Err(e) => {
            warn!(error = ?e, "Failed to fetch roles during teardown");
            execution_errors.push("Failed to fetch guild roles to restore permissions".to_string());
        }
    }

    if !execution_errors.is_empty() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error".to_string(),
        ));
    }

    Ok(StatusCode::OK)
}


fn is_not_found_error(err: &serenity::Error) -> bool {
    if let serenity::Error::Http(http_err) = err {
        if let Some(status) = http_err.status_code() {
            return status == StatusCode::NOT_FOUND;
        }
    }
    false
}