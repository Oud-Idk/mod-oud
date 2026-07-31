use crate::features::temp_voice::interface::{create_ephemeral_msg, preflight_button_check};
use crate::features::temp_voice::service;
use crate::{Data, Error};
use serenity::all::{ComponentInteraction, Context};

pub(crate) async fn handle_lock_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Ok(Some((channel_id, guild_id))) = preflight_button_check(
        ctx, interaction, data
    ).await else {
        return Ok(());
    };

    let response_message = service::lock_temp_vc(&ctx.http, guild_id, channel_id).await?;

    interaction
        .create_response(&ctx.http, create_ephemeral_msg(&response_message))
        .await?;

    Ok(())
}