use crate::features::temp_voice::interface::preflight_slash_check;
use crate::features::temp_voice::service;
use crate::shared::messages::send_ephemeral;
use crate::{Context, Error};
use serenity::all::User;

/// Trust users in your temporary voice channel.
#[poise::command(slash_command)]
pub async fn trust(
    ctx: Context<'_>,
    #[description = "The users to trust"] target: User,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let (channel_id, _, member) = match preflight_slash_check(&ctx).await? {
        Some(val) => val,
        None => return Ok(()),
    };

    let response_message = service::trust_users_in_vc(
        &ctx.serenity_context().http,
        channel_id,
        vec![target.id],
        member.user.id,
    ).await?;

    send_ephemeral(&ctx, response_message).await?;

    Ok(())
}
