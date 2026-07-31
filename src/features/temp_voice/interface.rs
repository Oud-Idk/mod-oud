use fred::interfaces::HashesInterface;
use crate::features::temp_voice::cache;
use crate::{Data, Error, Context as PoiseContext};
use serenity::all::{ActionRowComponent, ChannelId, ComponentInteraction, ComponentInteractionDataKind, Context, CreateInteractionResponse, CreateInteractionResponseMessage, GuildId, Interaction, Member, ModalInteraction};
use crate::shared::embed::send_ephemeral;

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
            data: &Data
        ) -> Result<Option<(ChannelId, GuildId)>, Error> {
            match cache::find_active_temp_vc(
                data, interaction.guild_id, interaction.user.id
            ).await? {
                Ok((channel_id, guild_id)) => Ok(Some((channel_id, guild_id))),
                Err(error_msg) => {
                    interaction.create_response(&ctx.http, create_ephemeral_msg(error_msg)).await?;
                    Ok(None)
                }
            }
        }
    };
}

impl_preflight_check!(preflight_button_check, ComponentInteraction);
impl_preflight_check!(preflight_modal_check, ModalInteraction);

pub fn create_ephemeral_msg(msg: &str) -> CreateInteractionResponse {
    CreateInteractionResponse::Message(
        CreateInteractionResponseMessage::new().content(msg).ephemeral(true),
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
    get_input_value(&interaction, "new_name")
}

pub async fn preflight_slash_check(
    ctx: &PoiseContext<'_>,
) -> Result<Option<(ChannelId, GuildId, Member)>, Error> {
    let guild_id = match ctx.guild_id() {
        Some(g) => g,
        None => {
            send_ephemeral(ctx, "This command can only be used in a server.").await?;
            return Ok(None);
        }
    };

    let author_id = ctx.author().id;

    // Get current user's voice channel from cache
    let user_vc_id = ctx.cache().guild(guild_id).and_then(|g| {
        g.voice_states.get(&author_id).and_then(|vs| vs.channel_id)
    });

    let Some(channel_id) = user_vc_id else {
        send_ephemeral(ctx, "You must be inside your temporary voice channel to use this command!").await?;
        return Ok(None);
    };

    // Verify ownership via Redis
    let redis = &ctx.data().redis;
    let temp_vc_hash = format!("temp_vcs:{}", guild_id);
    let owner_id_str: Option<String> = redis.hget(&temp_vc_hash, channel_id.get().to_string()).await?;

    let is_owner = match owner_id_str {
        Some(ref id) => id == &author_id.get().to_string(),
        None => false,
    };

    if !is_owner {
        send_ephemeral(ctx, "You do not own this voice channel! Only the channel owner can control it.").await?;
        return Ok(None);
    }

    let member = ctx.author_member().await.ok_or("Failed to fetch member")?.into_owned();

    Ok(Some((channel_id, guild_id, member)))
}

pub async fn handle_interaction(
    ctx: &Context,
    interaction: &Interaction,
    data: &Data,
) -> Result<(), Error> {
    match interaction {
        Interaction::Component(component) => {
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
                "temp_voice_transfer_accept" => transfer_action::handle_accept_transfer(ctx, component, data).await?,
                "temp_voice_transfer_decline" => transfer_action::handle_decline_transfer(ctx, component, data).await?,

                "temp_voice_trust_select" => {
                    if let ComponentInteractionDataKind::UserSelect { values } = &component.data.kind {
                        trust::handle_trust_temp_vc_submit(ctx, component, data, values.clone()).await?;
                    }
                }

                "temp_voice_transfer_select" => {
                    if let ComponentInteractionDataKind::UserSelect { values } = &component.data.kind {
                        transfer::handle_transfer_temp_vc_submit(ctx, component, data, values.clone()).await?;
                    }
                }
                "temp_voice_untrust_select" => {
                    if let ComponentInteractionDataKind::UserSelect { values } = &component.data.kind {
                        untrust::handle_untrust_temp_vc_submit(ctx, component, data, values.clone()).await?;
                    }
                }
                "temp_voice_block_select" => {
                    if let ComponentInteractionDataKind::UserSelect { values } = &component.data.kind {
                        block::handle_block_temp_vc_submit(ctx, component, data, values.clone()).await?;
                    }
                }
                "temp_voice_unblock_select" => {
                    if let ComponentInteractionDataKind::UserSelect { values } = &component.data.kind {
                        unblock::handle_unblock_temp_vc_submit(ctx, component, data, values.clone()).await?;
                    }
                }
                _ => {}
            }
        }
        Interaction::Modal(modal) => {
            match modal.data.custom_id.as_str() {
                "temp_voice_rename_modal" => rename::handle_rename_temp_vc_submit(ctx, modal, data).await?,
                "temp_voice_limit_modal" => limit::handle_set_limit_vc_submit(ctx, modal, data).await?,
                "temp_voice_kick_modal" => kick::handle_kick_temp_vc_submit(ctx, modal, data).await?,
                _ => {}
            }
        }
        _ => {}
    }
    Ok(())
}

