use crate::core::config::state::{Context, Error};
use crate::features::temp_voice::interface::preflight_slash_check;
use crate::features::temp_voice::service;
use crate::shared::messages::send_ephemeral;
use serenity::all::User;

/// Trust users in your temporary voice channel.
#[poise::command(slash_command)]
pub async fn trust(
    ctx: Context<'_>,
    #[description = "The users to trust"] target: User,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let Some((channel_id, _, member)) = preflight_slash_check(&ctx).await? else {
        return Ok(());
    };

    let response_message = service::trust_users_in_vc(
        &ctx.serenity_context().http,
        channel_id,
        vec![target.id],
        member.user.id,
    )
    .await?;

    send_ephemeral(&ctx, response_message).await?;

    Ok(())
}
