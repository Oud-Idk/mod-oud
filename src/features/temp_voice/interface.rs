use crate::core::config::state::{BotData, Context as PoiseContext, Error};
use crate::features::temp_voice::cache;
use crate::features::temp_voice::keys::temp_vcs_key;
use crate::shared::messages::send_ephemeral;
use anyhow::Context as _;
use fred::interfaces::HashesInterface;
use serenity::all::{
    ActionRowComponent, ChannelId, ComponentInteraction, ComponentInteractionDataKind, Context,
    CreateInteractionResponse, CreateInteractionResponseMessage, GuildId, Interaction, Member,
    ModalInteraction,
};
use serenity::model::id::UserId;

mod block;
mod delete;
mod kick;
mod limit;
mod lock;
mod rename;
mod transfer;
mod transfer_action;
mod trust;
mod unblock;
mod unlock;
mod untrust;

macro_rules! impl_preflight_check {
    ($fn_name:ident, $interaction_type:ty) => {
        pub async fn $fn_name(
            ctx: &Context,
            interaction: &$interaction_type,
            data: &BotData,
        ) -> Result<Option<(ChannelId, GuildId)>, Error> {
            // Ensure the interaction happened inside a server/guild
            let Some(guild_id) = interaction.guild_id else {
                interaction
                    .create_response(
                        &ctx.http,
                        create_ephemeral_msg("This can only be used in a server."),
                    )
                    .await?;
                return Ok(None);
            };

            // Check if the user owns an active temp VC
            let Some(channel_id) =
                cache::get_owned_temp_vc(data, guild_id, interaction.user.id).await?
            else {
                interaction
                    .create_response(
                        &ctx.http,
                        create_ephemeral_msg(
                            "You don't currently have an active temp voice channel.",
                        ),
                    )
                    .await?;
                return Ok(None);
            };

            Ok(Some((channel_id, guild_id)))
        }
    };
}

impl_preflight_check!(preflight_button_check, ComponentInteraction);
impl_preflight_check!(preflight_modal_check, ModalInteraction);

pub fn create_ephemeral_msg(msg: &str) -> CreateInteractionResponse {
    CreateInteractionResponse::Message(
        CreateInteractionResponseMessage::new()
            .content(msg)
            .ephemeral(true),
    )
}

pub fn get_input_value(interaction: &ModalInteraction, custom_id: &str) -> Option<String> {
    interaction
        .data
        .components
        .iter()
        .flat_map(|row| row.components.iter())
        .find_map(|c| match c {
            ActionRowComponent::InputText(input) if input.custom_id == custom_id => {
                input.value.clone()
            }
            _ => None,
        })
}

pub fn get_new_name(interaction: &ModalInteraction) -> Option<String> {
    get_input_value(interaction, "new_name")
}

pub async fn preflight_slash_check(
    ctx: &PoiseContext<'_>,
) -> Result<Option<(ChannelId, GuildId, Member)>, Error> {
    let Some(guild_id) = ctx.guild_id() else {
        send_ephemeral(ctx, "This command can only be used in a server.").await?;
        return Ok(None);
    };

    let author_id = ctx.author().id;

    // Get current user's voice channel from cache
    let user_vc_id = ctx
        .cache()
        .guild(guild_id)
        .and_then(|g| g.voice_states.get(&author_id).and_then(|vs| vs.channel_id));

    let Some(channel_id) = user_vc_id else {
        send_ephemeral(
            ctx,
            "You must be inside your temporary voice channel to use this command!",
        )
        .await?;
        return Ok(None);
    };

    // Verify ownership via Redis
    let redis = &ctx.data().core.redis;
    let temp_vc_hash = temp_vcs_key(guild_id);
    let owner_id_str: Option<String> = redis
        .hget(&temp_vc_hash, channel_id.get().to_string())
        .await?;

    let is_owner = owner_id_str
        .as_ref()
        .is_some_and(|id| id == &author_id.get().to_string());

    if !is_owner {
        send_ephemeral(
            ctx,
            "You do not own this voice channel! Only the channel owner can control it.",
        )
        .await?;
        return Ok(None);
    }

    let member = ctx
        .author_member()
        .await
        .with_context(|| "Failed to fetch member.")?
        .into_owned();

    Ok(Some((channel_id, guild_id, member)))
}

/// Main entry point
///
/// # Errors
/// Returns [`Err`] if either DB, Discord, or Redis fails.
pub async fn handle_interaction(
    ctx: &Context,
    interaction: &Interaction,
    data: &BotData,
) -> Result<(), Error> {
    match interaction {
        Interaction::Component(component) => {
            Box::pin(handle_component_interaction(ctx, component, data)).await
        }
        Interaction::Modal(modal) => Box::pin(handle_modal_interaction(ctx, modal, data)).await,
        _ => Ok(()),
    }
}

/// Dispatches component interactions (buttons and select menus)
async fn handle_component_interaction(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    match &component.data.kind {
        ComponentInteractionDataKind::Button => {
            handle_button_interaction(ctx, component, data).await
        }
        ComponentInteractionDataKind::UserSelect { values } => {
            handle_select_interaction(ctx, component, data, values).await
        }
        _ => Ok(()),
    }
}

/// Dispatches button clicks
async fn handle_button_interaction(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    match component.data.custom_id.as_str() {
        "temp_voice_rename" => rename::handle_rename_temp_vc(ctx, component, data).await?,
        "temp_voice_limit" => limit::handle_set_limit_vc(ctx, component, data).await?,
        "temp_voice_kick" => kick::handle_kick_temp_vc(ctx, component, data).await?,
        "temp_voice_lock" => lock::handle_lock_temp_vc(ctx, component, data).await?,
        "temp_voice_unlock" => unlock::handle_unlock_temp_vc(ctx, component, data).await?,
        "temp_voice_trust" => trust::handle_trust_temp_vc(ctx, component, data).await?,
        "temp_voice_untrust" => untrust::handle_untrust_temp_vc(ctx, component, data).await?,
        "temp_voice_block" => block::handle_block_temp_vc(ctx, component, data).await?,
        "temp_voice_unblock" => unblock::handle_unblock_temp_vc(ctx, component, data).await?,
        "temp_voice_delete" => delete::handle_delete_temp_vc(ctx, component, data).await?,
        "temp_voice_transfer" => transfer::handle_transfer_temp_vc(ctx, component, data).await?,
        "temp_voice_transfer_accept" => {
            transfer_action::handle_accept_transfer(ctx, component, data).await?;
        }
        "temp_voice_transfer_decline" => {
            transfer_action::handle_decline_transfer(ctx, component, data).await?;
        }
        _ => {}
    }
    Ok(())
}

/// Dispatches `UserSelect` menu submissions
async fn handle_select_interaction(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &BotData,
    values: &[UserId],
) -> Result<(), Error> {
    match component.data.custom_id.as_str() {
        "temp_voice_trust_select" => {
            trust::handle_trust_temp_vc_submit(ctx, component, data, values.to_vec()).await?;
        }
        "temp_voice_transfer_select" => {
            transfer::handle_transfer_temp_vc_submit(ctx, component, data, values.to_vec()).await?;
        }
        "temp_voice_untrust_select" => {
            untrust::handle_untrust_temp_vc_submit(ctx, component, data, values.to_vec()).await?;
        }
        "temp_voice_block_select" => {
            block::handle_block_temp_vc_submit(ctx, component, data, values.to_vec()).await?;
        }
        "temp_voice_unblock_select" => {
            unblock::handle_unblock_temp_vc_submit(ctx, component, data, values.to_vec()).await?;
        }
        _ => {}
    }
    Ok(())
}

/// Dispatches Modal submissions
async fn handle_modal_interaction(
    ctx: &Context,
    modal: &ModalInteraction,
    data: &BotData,
) -> Result<(), Error> {
    match modal.data.custom_id.as_str() {
        "temp_voice_rename_modal" => rename::handle_rename_temp_vc_submit(ctx, modal, data).await?,
        "temp_voice_limit_modal" => limit::handle_set_limit_vc_submit(ctx, modal, data).await?,
        "temp_voice_kick_modal" => kick::handle_kick_temp_vc_submit(ctx, modal, data).await?,
        _ => {}
    }
    Ok(())
}
