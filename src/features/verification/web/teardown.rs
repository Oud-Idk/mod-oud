use crate::core::config::state::WebState;
use crate::shared::error;
use crate::shared::guild_resource::channel_in_guild;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{ChannelId, EditRole, GuildId, Permissions, RoleId};
use std::sync::Arc;
use tracing::{debug, warn};

#[serde_as]
#[derive(Deserialize, Clone, Debug)]
pub struct TeardownVerificationRequest {
    #[serde_as(as = "DisplayFromStr")]
    pub verification_channel_id: ChannelId,
    #[serde_as(as = "DisplayFromStr")]
    pub verification_role_id: RoleId,
}

pub async fn handle_verification_teardown(
    State(state): State<Arc<WebState>>,
    Path(guild_id): Path<GuildId>,
    Json(payload): Json<TeardownVerificationRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let http = &state.serenity_http;

    let channel_id = payload.verification_channel_id;
    let role_id = payload.verification_role_id;

    let mut execution_errors = Vec::new();

    // Both targets arrive in the body. The channel check is mandatory: deleting a channel is
    // destructive and there is no way to undo it.
    let channel_owned = match channel_in_guild(http, channel_id, guild_id).await {
        Ok(owned) => owned,
        Err(e) if error::is_not_found_error(&e) => {
            debug!(%guild_id, %channel_id, "verification channel already gone during teardown");
            true
        }
        Err(e) => {
            warn!(error = ?e, %guild_id, %channel_id, "verification channel lookup failed during teardown");
            false
        }
    };

    if channel_owned
        && let Err(e) = channel_id.delete(http).await
        && !is_not_found_error(&e)
    {
        warn!(error = ?e, %channel_id, "verification channel not deleted during teardown");
        execution_errors.push("Failed to delete verification channel".to_string());
    } else if !channel_owned {
        warn!(
            %guild_id,
            %channel_id,
            "verification channel not deleted; it does not belong to this guild"
        );
        execution_errors.push("Verification channel does not belong to this server".to_string());
    }

    if let Err(e) = guild_id.delete_role(http, role_id).await
        && !is_not_found_error(&e)
    {
        warn!(error = ?e, %role_id, "verification role not deleted during teardown");
        execution_errors.push("Failed to delete verification role".to_string());
    }

    let everyone_role_id = RoleId::new(guild_id.get());
    match guild_id.roles(http).await {
        Ok(roles) => {
            if let Some(everyone_role) = roles.get(&everyone_role_id) {
                let mut restored_permissions = everyone_role.permissions;
                restored_permissions.insert(Permissions::VIEW_CHANNEL);

                let edit_builder = EditRole::new().permissions(restored_permissions);
                if let Err(e) = guild_id
                    .edit_role(http, everyone_role_id, edit_builder)
                    .await
                {
                    warn!(
                        error = ?e,
                        %everyone_role_id,
                        "@everyone permissions not restored during teardown"
                    );
                    execution_errors.push("Failed to restore @everyone permissions".to_string());
                }
            } else {
                warn!(%everyone_role_id, "@everyone role unavailable during teardown");
                execution_errors.push("Could not locate @everyone role".to_string());
            }
        }
        Err(e) => {
            warn!(error = ?e, %guild_id, "guild roles lookup failed during teardown");
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
    if let serenity::Error::Http(http_err) = err
        && let Some(status) = http_err.status_code()
    {
        return status == StatusCode::NOT_FOUND;
    }
    false
}
