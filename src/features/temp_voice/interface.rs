use crate::features::temp_voice::cache;
use crate::{Data, Error};
use serenity::all::{ActionRowComponent, ChannelId, ComponentInteraction, ComponentInteractionDataKind, Context, CreateInteractionResponse, CreateInteractionResponseMessage, GuildId, Interaction, ModalInteraction};

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

