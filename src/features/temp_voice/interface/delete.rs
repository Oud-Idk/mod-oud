use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice::interface::{create_ephemeral_msg, preflight_button_check};
use crate::features::temp_voice::service;
use serenity::all::{ComponentInteraction, Context};

pub async fn handle_delete_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    let Some((channel_id, guild_id)) = preflight_button_check(ctx, interaction, data).await? else {
        return Ok(());
    };

    let user_id = interaction.user.id;

    let response_message = service::delete_temp_vc(
        &ctx.http,
        &data.core.redis,
        guild_id,
        channel_id,
        user_id,
    ).await?;

    interaction.create_response(&ctx, create_ephemeral_msg(&response_message)).await?;

    Ok(())
}