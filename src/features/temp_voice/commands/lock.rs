use crate::core::config::state::{Context, Error};
use crate::features::temp_voice::interface::preflight_slash_check;
use crate::features::temp_voice::service;
use crate::shared::messages::send_ephemeral;

/// Lock your temporary voice channel.
#[poise::command(slash_command)]
pub async fn lock(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let Some((channel_id, guild_id, _)) = preflight_slash_check(&ctx).await? else {
        return Ok(());
    };

    let response_message =
        service::lock_temp_vc(&ctx.serenity_context().http, guild_id, channel_id).await?;

    send_ephemeral(&ctx, response_message).await?;

    Ok(())
}
