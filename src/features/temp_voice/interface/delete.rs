use crate::features::temp_voice::interface::{create_ephemeral_msg, preflight_button_check};
use crate::features::temp_voice::service;
use crate::{Data, Error};
use serenity::all::{ComponentInteraction, Context};

pub(crate) async fn handle_delete_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Some((channel_id, guild_id)) = preflight_button_check(ctx, interaction, data).await? else {
        return Ok(());
    };

    let user_id = interaction.user.id;

    let response_message = service::delete_temp_vc(
        &ctx.http,
        &data.redis,
        guild_id,
        channel_id,
        user_id,
    ).await?;

    interaction.create_response(&ctx, create_ephemeral_msg(&response_message)).await?;

    Ok(())
}