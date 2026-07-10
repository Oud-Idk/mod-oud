use crate::events::handlers::temp_voice::interface;
use crate::events::handlers::temp_voice::interface::utils::create_ephemeral_msg;
use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{ComponentInteraction, Context, PermissionOverwriteType, RoleId};
use tracing::debug;

pub(crate) async fn handle_unlock_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Ok(Some((channel_id, guild_id))) = interface::preflight_button_check(
        ctx, interaction, data
    ).await else {
        return Ok(());
    };

    debug!("Unlocking voice channel: {}", channel_id);

    let target = PermissionOverwriteType::Role(RoleId::new(guild_id.get()));

    if let Err(e) = channel_id.delete_permission(&ctx.http, target).await {
        match e {
            serenity::Error::Http(ref http_err) => {
                // If the overwrite wasn't found (already unlocked), we can safely ignore it
                if http_err.status_code() != Some(serenity::all::StatusCode::NOT_FOUND) {
                    return Err(e.into());
                }
            }
            _ => return Err(e.into()),
        }
    }

    interaction
        .create_response(
            &ctx.http,
            create_ephemeral_msg("This channel is now **unlocked** and open for everyone to join."),
        )
        .await?;

    Ok(())
}