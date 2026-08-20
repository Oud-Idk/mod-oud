use crate::core::config::state::{Context, Error};
use crate::features::temp_voice::interface::preflight_slash_check;
use crate::features::temp_voice::service;
use crate::shared::messages::send_ephemeral;

/// Rename your temporary voice channel.
#[poise::command(slash_command)]
pub async fn rename(
    ctx: Context<'_>,
    #[description = "New channel name (leave blank to reset)"] new_name: Option<String>,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let Some((channel_id, guild_id, member)) = preflight_slash_check(&ctx).await? else {
        return Ok(());
    };

    let raw_input = new_name.as_deref().unwrap_or("");

    let response_message = service::rename_temp_vc(
        ctx.serenity_context(),
        &ctx.data().core.redis,
        &ctx.data().core.db,
        guild_id,
        channel_id,
        &member,
        raw_input,
    )
    .await?;

    send_ephemeral(&ctx, response_message).await?;

    Ok(())
}
