use crate::core::config::state::{Context, Error};
use crate::features::temp_voice::interface::preflight_slash_check;
use crate::features::temp_voice::service;
use crate::shared::messages::send_ephemeral;

/// Set the user limit for your temporary voice channel.
#[poise::command(slash_command)]
pub async fn limit(
    ctx: Context<'_>,
    #[description = "New user limit (1-99, leave blank to reset)"] new_limit: Option<String>,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let (channel_id, _, _) = match preflight_slash_check(&ctx).await? {
        Some(val) => val,
        None => return Ok(()),
    };

    let raw_input = new_limit.as_deref().unwrap_or("");

    let response_message =
        service::set_temp_vc_limit(ctx.serenity_context(), channel_id, raw_input).await?;

    send_ephemeral(&ctx, response_message).await?;

    Ok(())
}
