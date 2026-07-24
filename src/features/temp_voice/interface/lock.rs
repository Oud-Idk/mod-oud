use crate::features::temp_voice::interface::{create_ephemeral_msg, preflight_button_check};
use crate::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{
    ComponentInteraction, Context, PermissionOverwrite, PermissionOverwriteType, Permissions, RoleId,
};
use tracing::debug;

pub(crate) async fn handle_lock_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    // Grab the channel and guild ID from our preflight helper
    let Ok(Some((channel_id, guild_id))) = preflight_button_check(
        ctx, interaction, data
    ).await else {
        return Ok(());
    };

    debug!("Locking voice channel: {}", channel_id);

    // Create a permission overwrite that denies CONNECT to the @everyone role
    let overwrite = PermissionOverwrite {
        allow: Permissions::empty(),
        deny: Permissions::CONNECT,
        kind: PermissionOverwriteType::Role(RoleId::new(guild_id.get())),
    };

    channel_id.create_permission(&ctx.http, overwrite).await?;

    interaction
        .create_response(
            &ctx.http,
            create_ephemeral_msg("This channel is now **locked**. Members will no longer be able to join unless trusted."),
        )
        .await?;

    Ok(())
}