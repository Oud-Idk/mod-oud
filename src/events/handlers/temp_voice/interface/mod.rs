use crate::events::handlers::temp_voice::interface::utils::create_ephemeral_msg;
use crate::types::{Data, Error};
use serenity::all::{ChannelId, ComponentInteraction, Context, GuildId, ModalInteraction};

pub mod rename;
pub mod limit;
pub mod utils;
pub mod kick;
pub mod trust;
pub mod untrust;
pub mod block;
pub mod unblock;
pub mod lock;
pub mod unlock;
pub mod delete;
pub mod transfer;
pub mod transfer_action;

macro_rules! impl_preflight_check {
    ($fn_name:ident, $interaction_type:ty) => {
        pub async fn $fn_name(
            ctx: &Context,
            interaction: &$interaction_type,
            data: &Data
        ) -> Result<Option<(ChannelId, GuildId)>, Error> {
            match utils::find_active_temp_vc(
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