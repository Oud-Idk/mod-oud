use crate::core::config::state::{Context, Error};
use crate::features::temp_voice::interface::preflight_slash_check;
use crate::features::temp_voice::service;
use crate::shared::messages::send_ephemeral;
use serenity::all::User;

/// Unblock users from your temporary voice channel.
#[poise::command(slash_command)]
pub async fn unblock(
    ctx: Context<'_>,
    #[description = "The users to unblock"] target: User,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let Some((channel_id, _, _)) = preflight_slash_check(&ctx).await? else {
        return Ok(());
    };

    let response_message =
        service::unblock_users_from_vc(&ctx.serenity_context().http, channel_id, vec![target.id])
            .await?;

    send_ephemeral(&ctx, response_message).await?;

    Ok(())
}
