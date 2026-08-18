use crate::core::config::state::{Context, Error};
use crate::features::temp_voice::interface::preflight_slash_check;
use crate::features::temp_voice::service;
use crate::shared::messages::send_ephemeral;
use serenity::all::User;

/// Block users from your temporary voice channel.
#[poise::command(slash_command)]
pub async fn block(
    ctx: Context<'_>,
    #[description = "The users to block"] target: User,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let (channel_id, guild_id, member) = match preflight_slash_check(&ctx).await? {
        Some(val) => val,
        None => return Ok(()),
    };

    let response_message = service::block_users_from_vc(
        &ctx.serenity_context().http,
        guild_id,
        channel_id,
        vec![target.id],
        member.user.id,
    )
    .await?;

    send_ephemeral(&ctx, response_message).await?;

    Ok(())
}
