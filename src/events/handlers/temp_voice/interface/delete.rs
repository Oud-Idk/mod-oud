use crate::events::handlers::temp_voice::interface;
use crate::events::handlers::temp_voice::interface::utils::create_ephemeral_msg;
use crate::types::{Data, Error};
use fred::interfaces::HashesInterface;
use serenity::all::{ComponentInteraction, Context};
use tracing::{debug, error, warn};

pub(crate) async fn handle_delete_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Some((channel_id, guild_id)) = interface::preflight_button_check(ctx, interaction, data).await? else {
        return Ok(());
    };

    let user_id = interaction.user.id;
    let redis = &data.redis;

    let temp_vc_hash = format!("temp_vcs:{}", guild_id);
    let temp_vc_field = channel_id.get().to_string();

    let owner_id_str: Option<String> = redis.hget(&temp_vc_hash, &temp_vc_field).await?;

    let is_owner = match owner_id_str {
        Some(ref id) => id == &user_id.get().to_string(),
        None => false,
    };

    if !is_owner {
        interaction.create_response(
            &ctx,
            create_ephemeral_msg("You don't own this channel! Only the channel owner can delete it."),
        )
            .await?;
        return Ok(());
    }

    debug!(channel_id = channel_id.get(), "Owner requested manual deletion of temp VC. Cleaning up.");

    if let Err(e) = channel_id.delete(&ctx.http).await {
        error!("Failed to delete temp VC {}: {:?}", channel_id, e);
        interaction.create_response(
            &ctx,
            create_ephemeral_msg("Could not delete the channel. Do I have the 'Manage Channels' permission?"),
        )
            .await?;
        return Ok(());
    }

    let owner_hash = format!("temp_vc_owners:{}", guild_id);
    let user_id_field = user_id.get().to_string();

    let del_vc_fut = redis.hdel::<(), _, _>(&temp_vc_hash, &temp_vc_field);
    let del_owner_fut = redis.hdel::<(), _, _>(&owner_hash, &user_id_field);

    let (r1, r2) = tokio::join!(del_vc_fut, del_owner_fut);
    if let Err(e) = r1 {
        warn!("Failed to delete temp VC mapping from cache: {:?}", e);
    }
    if let Err(e) = r2 {
        warn!("Failed to delete owner reverse index mapping from cache: {:?}", e);
    }

    interaction.create_response(
        &ctx,
        create_ephemeral_msg("Your voice channel has been deleted."),
    )
        .await?;

    Ok(())
}