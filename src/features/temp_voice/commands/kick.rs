use crate::features::temp_voice::service;
use crate::shared::embed::send_ephemeral;
use crate::{Context, Error};
use serenity::all::User;
use crate::features::temp_voice::interface::preflight_slash_check;

/// Disconnect a user from your temporary voice channel.
#[poise::command(slash_command)]
pub async fn kick(
    ctx: Context<'_>,
    #[description = "The user to kick from your channel"] target: User,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let (_, guild_id, _) = match preflight_slash_check(&ctx).await? {
        Some(val) => val,
        None => return Ok(()),
    };

    let response_message = service::kick_user_by_id(&ctx.serenity_context().http, guild_id, target.id).await?;

    send_ephemeral(&ctx, response_message).await?;

    Ok(())
}