use crate::core::config::state::{Context, Error};
use crate::features::temp_voice::interface::preflight_slash_check;
use crate::features::temp_voice::service;
use crate::shared::messages::send_ephemeral;
use serenity::all::User;

/// Transfer ownership of your temporary voice channel to another user.
#[poise::command(slash_command)]
pub async fn transfer(
    ctx: Context<'_>,
    #[description = "The user to transfer ownership to"] target: User,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let Some((channel_id, guild_id, member)) = preflight_slash_check(&ctx).await? else {
        return Ok(());
    };

    let response_message = service::initiate_temp_vc_transfer(
        ctx.serenity_context(),
        ctx.data(),
        guild_id,
        channel_id,
        member.user.id,
        target.id,
    )
    .await?;

    send_ephemeral(&ctx, response_message).await?;

    Ok(())
}
