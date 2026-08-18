use crate::core::config::state::{Context, Error};
use crate::features::temp_voice::interface::preflight_slash_check;
use crate::features::temp_voice::service;
use crate::shared::messages::send_ephemeral;

/// Delete your temporary voice channel.
#[poise::command(slash_command)]
pub async fn delete(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let (channel_id, guild_id, member) = match preflight_slash_check(&ctx).await? {
        Some(val) => val,
        None => return Ok(()),
    };

    let response_message = service::delete_temp_vc(
        &ctx.serenity_context().http,
        &ctx.data().core.redis,
        guild_id,
        channel_id,
        member.user.id,
    )
    .await?;

    send_ephemeral(&ctx, response_message).await?;

    Ok(())
}
