use crate::Error;
use crate::core::config::state::WebState;
use crate::shared::embed::DiscordEmbed;
use crate::shared::embed::Format;
use crate::shared::embed::build_custom_message;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serenity::all::{ButtonStyle, ChannelId, ChannelType, CreateActionRow, CreateButton, CreateChannel, EditRole, GuildChannel, GuildId, Http, Message, PermissionOverwrite, PermissionOverwriteType, Permissions, Role, RoleId};
use std::sync::Arc;
use serde_with::{serde_as, DisplayFromStr};
use tracing::{trace, warn};
use crate::core::config::settings::MessageLayout;

#[serde_as]
#[derive(Serialize, Clone, Debug)]
pub struct SetupVerificationResponse {
    #[serde_as(as = "DisplayFromStr")]
    verification_message_id: u64,
    #[serde_as(as = "DisplayFromStr")]
    verification_channel_id: u64,
    #[serde_as(as = "DisplayFromStr")]
    verification_role_id: u64,
}

struct RollbackState {
    everyone_role_id: RoleId,
    original_everyone_permissions: Option<Permissions>,
    created_role_id: Option<RoleId>,
    created_channel_id: Option<ChannelId>,
}

impl RollbackState {
    fn new(everyone_role_id: RoleId) -> Self {
        Self {
            everyone_role_id,
            original_everyone_permissions: None,
            created_role_id: None,
            created_channel_id: None,
        }
    }

    /// Reverts successfully applied changes in reverse chronological order.
    async fn rollback(self, http: &Http, guild_id: GuildId) {
        if let Some(channel_id) = self.created_channel_id {
            if let Err(e) = channel_id.delete(http).await {
                warn!(error = ?e, channel_id = channel_id.get(), "Rollback: Failed to delete created channel");
            }
        }

        if let Some(role_id) = self.created_role_id {
            if let Err(e) = guild_id.delete_role(http, role_id).await {
                warn!(error = ?e, role_id = role_id.get(), "Rollback: Failed to delete created role");
            }
        }

        if let Some(orig_perms) = self.original_everyone_permissions {
            let edit_builder = EditRole::new().permissions(orig_perms);
            if let Err(e) = guild_id.edit_role(http, self.everyone_role_id, edit_builder).await {
                warn!(error = ?e, "Rollback: Failed to restore original @everyone permissions");
            }
        }
    }
}

pub async fn handle_verification_setup(
    State(state): State<Arc<WebState>>,
    Path(guild_id_str): Path<String>,
    Json(payload): Json<MessageLayout>,
) -> Result<(StatusCode, Json<SetupVerificationResponse>), (StatusCode, String)> {
    let http = &state.http;

    let guild_id_u64 = guild_id_str
        .parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, guild_id_str = guild_id_str, "Failed to parse guild ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid guild ID".to_string()))?;
    let guild_id = GuildId::from(guild_id_u64);
    let everyone_role_id = RoleId::from(guild_id.get());

    let roles = guild_id.roles(http)
        .await
        .inspect_err(|e| warn!(error = ?e, guild_id = guild_id.get(), "Failed to get roles for guild"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Cannot get roles".to_string()))?;

    let Some(everyone_role) = roles.get(&everyone_role_id) else {
        warn!("Cannot get @everyone from roles.");
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "Server error".to_string()));
    };

    match execute_setup(http, guild_id, everyone_role_id, everyone_role, &payload).await {
        Ok(response) => Ok((StatusCode::OK, Json(response))),
        Err((status, message, rollback_state)) => {
            rollback_state.rollback(http, guild_id).await;
            Err((status, message))
        }
    }
}

async fn execute_setup(
    http: &Arc<Http>,
    guild_id: GuildId,
    everyone_role_id: RoleId,
    everyone_role: &Role,
    payload: &MessageLayout,
) -> Result<SetupVerificationResponse, (StatusCode, String, RollbackState)> {
    let mut rollback_state = RollbackState::new(everyone_role_id);

    if let Err(e) = remove_perms_from_everyone(http, guild_id, everyone_role_id, everyone_role).await {
        warn!(error = ?e, guild_id = guild_id.get(), "Failed to remove perms from everyone for guild");
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Cannot modify @everyone permissions".to_string(),
            rollback_state,
        ));
    }
    rollback_state.original_everyone_permissions = Some(everyone_role.permissions);

    let verify_role = match create_verify_role(http, guild_id).await {
        Ok(role) => role,
        Err(e) => {
            warn!(error = ?e, guild_id = guild_id.get(), "Failed to create verify role for guild");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Cannot create verification role".to_string(),
                rollback_state,
            ));
        }
    };
    rollback_state.created_role_id = Some(verify_role.id);

    let verify_channel = match create_verify_channel(http, guild_id, everyone_role_id, verify_role.id).await {
        Ok(channel) => channel,
        Err(e) => {
            warn!(error = ?e, guild_id = guild_id.get(), "Failed to create verification channel for guild");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Cannot create verification channel".to_string(),
                rollback_state,
            ));
        }
    };
    rollback_state.created_channel_id = Some(verify_channel.id);

    let verify_message = match send_verification_panel(payload, http, &verify_channel).await {
        Ok(msg) => msg,
        Err((status, message)) => {
            return Err((status, message, rollback_state));
        }
    };

    let http_clone = Arc::clone(http);
    let role_id_to_grant = verify_role.id;

    tokio::spawn(async move {
        grant_role_to_existing_members(http_clone, guild_id, role_id_to_grant).await;
    });

    Ok(SetupVerificationResponse {
        verification_role_id: verify_role.id.get(),
        verification_channel_id: verify_channel.id.get(),
        verification_message_id: verify_message.id.get(),
    })
}

async fn send_verification_panel(
    payload: &MessageLayout,
    http: &Arc<Http>,
    verify_channel: &GuildChannel,
) -> Result<Message, (StatusCode, String)> {
    let verify_button = CreateButton::new("verify")
        .style(ButtonStyle::Primary)
        .label("Verify");

    let verify_row = CreateActionRow::Buttons(vec![verify_button]);

    let verify_panel_builder = build_custom_message(
        payload.format,
        &payload.content,
        &payload.embed,
        |t| t.to_string(),
    )
        .inspect_err(|e| {
            warn!(error = ?e, guild_id = verify_channel.guild_id.get(), "Failed to build verification panel for guild")
        })
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Failed to build message.".to_string()))?
        .ok_or_else(|| {
            warn!(guild_id = verify_channel.guild_id.get(), payload = ?payload.embed, "Failed to build verification panel for guild. Check payload?");
            (StatusCode::BAD_REQUEST, "Invalid embed configuration".to_string())
        })?
        .components(vec![verify_row]);

    verify_channel
        .send_message(http, verify_panel_builder)
        .await
        .inspect_err(|e| {
            warn!(error = ?e, guild_id = verify_channel.guild_id.get(), "Failed to send verification panel for guild")
        })
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Error sending panel message".to_string()))
}

async fn create_verify_channel(
    http: &Arc<Http>,
    guild_id: GuildId,
    everyone_role_id: RoleId,
    verified_role_id: RoleId,
) -> serenity::Result<GuildChannel> {
    let everyone_overwrite = PermissionOverwrite {
        allow: Permissions::VIEW_CHANNEL | Permissions::READ_MESSAGE_HISTORY,
        deny: Permissions::SEND_MESSAGES | Permissions::ADD_REACTIONS,
        kind: PermissionOverwriteType::Role(everyone_role_id),
    };

    let verified_overwrite = PermissionOverwrite {
        allow: Permissions::empty(),
        deny: Permissions::VIEW_CHANNEL,
        kind: PermissionOverwriteType::Role(verified_role_id),
    };

    let channel_builder = CreateChannel::new("verify")
        .kind(ChannelType::Text)
        .topic("Please verify here to get access to the server!")
        .permissions(vec![everyone_overwrite, verified_overwrite]);

    guild_id.create_channel(http, channel_builder).await
}

async fn create_verify_role(http: &Arc<Http>, guild_id: GuildId) -> serenity::Result<Role> {
    let default_permissions = Permissions::VIEW_CHANNEL
        | Permissions::SEND_MESSAGES
        | Permissions::READ_MESSAGE_HISTORY;

    let role_builder = EditRole::new()
        .name("verified")
        .permissions(default_permissions)
        .hoist(false)
        .mentionable(false);
    guild_id.create_role(http, role_builder).await
}

async fn remove_perms_from_everyone(
    http: &Arc<Http>,
    guild_id: GuildId,
    everyone_role_id: RoleId,
    everyone_role: &Role,
) -> Result<(), Error> {
    let mut new_permissions = everyone_role.permissions;
    new_permissions.remove(Permissions::VIEW_CHANNEL);
    let edit_builder = EditRole::new().permissions(new_permissions);
    guild_id.edit_role(http, everyone_role_id, edit_builder).await?;
    Ok(())
}

async fn grant_role_to_existing_members(
    http: Arc<Http>,
    guild_id: GuildId,
    role_id: RoleId,
) {
    let mut after = None;

    loop {
        match guild_id.members(&http, Some(1000), after).await {
            Ok(members) => {
                if members.is_empty() {
                    break;
                }

                after = Some(members.last().unwrap().user.id);

                for member in members {
                    if member.user.bot {
                        continue;
                    }

                    if member.roles.contains(&role_id) {
                        continue;
                    }

                    if let Err(e) = http.add_member_role(
                        guild_id,
                        member.user.id,
                        role_id,
                        Some("Verification setup: adding role to existing members"),
                    ).await {
                        warn!(
                            error = ?e,
                            user_id = member.user.id.get(),
                            "Failed to add verification role to existing user"
                        );
                    } else {
                        trace!(user_id = member.user.id.get(), "Successfully added verification role to existing user");
                    }
                }
            }
            Err(e) => {
                warn!(error = ?e, guild_id = guild_id.get(), "Failed to fetch chunk of members for role granting");
                break;
            }
        }
    }
}