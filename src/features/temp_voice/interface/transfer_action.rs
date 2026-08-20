use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice::cache;
use crate::features::temp_voice::interface::create_ephemeral_msg;
use fred::clients::Client;
use serenity::all::{
    ChannelId, ComponentInteraction, Context, CreateInteractionResponse,
    CreateInteractionResponseMessage, GuildId, PermissionOverwrite, PermissionOverwriteType,
    Permissions, UserId,
};
use tracing::{debug, error, info, instrument, warn};

#[instrument(skip(ctx, data), fields(acceptor_id = %interaction.user.id.get()))]
pub async fn handle_accept_transfer(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    let Some(guild_id) = interaction.guild_id else {
        debug!("Transfer acceptance interaction received outside of a guild");
        return Ok(());
    };

    let Some(channel_id) = ctx.cache.guild(guild_id).and_then(|g| {
        g.voice_states
            .get(&interaction.user.id)
            .and_then(|vs| vs.channel_id)
    }) else {
        debug!("User attempting to accept transfer is not in a voice channel");
        interaction
            .create_response(
                &ctx.http,
                create_ephemeral_msg(
                    "You must be in the voice channel the transfer was offered for to accept!",
                ),
            )
            .await?;
        return Ok(());
    };

    let redis = &data.core.redis;

    // Validate transfer prerequisites & permissions in Redis
    let Some((current_owner, target_owner)) =
        validate_transfer_request(ctx, interaction, redis, guild_id, channel_id).await?
    else {
        return Ok(());
    };

    // Apply Discord channel permission updates
    let permissions_applied =
        apply_transfer_permissions(ctx, channel_id, interaction.user.id, &current_owner).await?;

    if !permissions_applied {
        interaction
            .create_response(
                &ctx.http,
                create_ephemeral_msg("Discord API error. Try again!"),
            )
            .await?;
        return Ok(());
    }

    // Commit state change to Redis
    cache::commit_transfer_to_redis(redis, guild_id, channel_id, &current_owner, &target_owner)
        .await?;

    info!(
        "Successfully transferred channel {} from owner {} to {}",
        channel_id.get(),
        current_owner,
        target_owner
    );

    // Update the interaction message
    let updated_text = format!(
        "<@{}> accepted the offer and is now the owner of this channel!",
        interaction.user.id
    );
    interaction
        .create_response(
            &ctx.http,
            CreateInteractionResponse::UpdateMessage(
                CreateInteractionResponseMessage::new()
                    .content(updated_text)
                    .components(vec![]),
            ),
        )
        .await?;

    Ok(())
}

/// Validates all Redis conditions before proceeding with the transfer.
/// Returns `Some((current_owner, target_owner))` if valid, or `None` if validation failed and was responded to.
async fn validate_transfer_request(
    ctx: &Context,
    interaction: &ComponentInteraction,
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
) -> Result<Option<(String, String)>, Error> {
    let target_owner_str = cache::get_pending_transfer_target(redis, channel_id).await?;

    let Some(target_owner) = target_owner_str else {
        debug!(
            "Transfer acceptance failed: No pending key in Redis or key expired for channel {}",
            channel_id.get()
        );
        interaction
            .create_response(
                &ctx.http,
                create_ephemeral_msg("No pending transfer request found, or it expired!"),
            )
            .await?;
        return Ok(None);
    };

    if target_owner != interaction.user.id.get().to_string() {
        debug!(
            "Transfer acceptance rejected: User {} is not the designated target {}",
            interaction.user.id.get(),
            target_owner
        );
        interaction
            .create_response(
                &ctx.http,
                create_ephemeral_msg("This transfer offer wasn't made for you!"),
            )
            .await?;
        return Ok(None);
    }

    let current_owner_str = cache::get_temp_vc_owner(redis, guild_id, channel_id).await?;

    let Some(current_owner) = current_owner_str else {
        warn!(
            "No current owner recorded in Redis for active channel {}",
            channel_id.get()
        );
        return Ok(None);
    };

    let acceptor_existing_vc = cache::get_owned_channel_id(redis, guild_id, &target_owner).await?;
    if let Some(existing_channel) = acceptor_existing_vc
        && existing_channel != channel_id.get().to_string()
    {
        warn!(
            acceptor_id = %interaction.user.id.get(),
            existing_channel = %existing_channel,
            offered_channel = %channel_id.get(),
            "Acceptor now owns a different temp VC; refusing to complete transfer"
        );
        let _ = cache::clear_pending_transfer(redis, channel_id).await;
        interaction
            .create_response(
                &ctx.http,
                create_ephemeral_msg(
                    "You already own a different temporary voice channel now, so this offer is no longer valid!",
                ),
            )
            .await?;
        return Ok(None);
    }

    Ok(Some((current_owner, target_owner)))
}

/// Applies owner permissions to the new owner and demotes the previous owner.
/// Returns `true` if successful, `false` if the new owner permissions failed to apply.
async fn apply_transfer_permissions(
    ctx: &Context,
    channel_id: ChannelId,
    new_owner_id: UserId,
    current_owner_str: &str,
) -> Result<bool, Error> {
    let new_overwrite = PermissionOverwrite {
        allow: Permissions::VIEW_CHANNEL
            | Permissions::CONNECT
            | Permissions::MANAGE_CHANNELS
            | Permissions::MOVE_MEMBERS
            | Permissions::MUTE_MEMBERS
            | Permissions::DEAFEN_MEMBERS,
        deny: Permissions::empty(),
        kind: PermissionOverwriteType::Member(new_owner_id),
    };

    debug!(
        "Applying new channel permissions for user {}",
        new_owner_id.get()
    );
    if let Err(e) = channel_id.create_permission(&ctx.http, new_overwrite).await {
        error!(
            "Failed to apply permission override to Discord API: {:?}",
            e
        );
        return Ok(false);
    }

    if let Ok(old_owner_id) = current_owner_str.parse::<u64>() {
        let old_owner_overwrite = PermissionOverwrite {
            allow: Permissions::VIEW_CHANNEL | Permissions::CONNECT,
            deny: Permissions::empty(),
            kind: PermissionOverwriteType::Member(UserId::new(old_owner_id)),
        };
        debug!(
            "Demoting old owner {} to member-level permissions",
            old_owner_id
        );
        if let Err(e) = channel_id
            .create_permission(&ctx.http, old_owner_overwrite)
            .await
        {
            warn!("Failed to demote old owner's permissions: {:?}", e);
        }
    }

    Ok(true)
}

#[instrument(skip(ctx, data), fields(decliner_id = %interaction.user.id.get()))]
pub async fn handle_decline_transfer(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    let Some(guild_id) = interaction.guild_id else {
        debug!("Transfer decline interaction received outside of a guild");
        return Ok(());
    };

    let Some(channel_id) = ctx.cache.guild(guild_id).and_then(|g| {
        g.voice_states
            .get(&interaction.user.id)
            .and_then(|vs| vs.channel_id)
    }) else {
        debug!("User attempting to decline transfer is not in a voice channel");
        interaction
            .create_response(
                &ctx.http,
                create_ephemeral_msg(
                    "You must be in the voice channel the transfer was offered for to decline!",
                ),
            )
            .await?;
        return Ok(());
    };

    let redis = &data.core.redis;
    let target_owner_str = cache::get_pending_transfer_target(redis, channel_id).await?;

    let Some(target_owner) = target_owner_str else {
        debug!(
            "Transfer decline failed: No pending key in Redis or key expired for channel {}",
            channel_id.get()
        );
        interaction
            .create_response(
                &ctx.http,
                create_ephemeral_msg("No pending transfer request found, or it expired!"),
            )
            .await?;
        return Ok(());
    };

    if target_owner != interaction.user.id.get().to_string() {
        debug!(
            "Transfer decline rejected: User {} is not the designated target {}",
            interaction.user.id.get(),
            target_owner
        );
        interaction
            .create_response(
                &ctx.http,
                create_ephemeral_msg("This transfer offer wasn't made for you!"),
            )
            .await?;
        return Ok(());
    }

    debug!(
        "Deleting pending transfer key from Redis for channel {}",
        channel_id.get()
    );
    let _ = cache::clear_pending_transfer(redis, channel_id).await;

    info!(
        "Transfer request for channel {} was declined by user {}",
        channel_id.get(),
        interaction.user.id.get()
    );

    let updated_text = format!(
        "❌ **Transfer Declined**\n<@{}> decided they didn't want the crown today.",
        interaction.user.id
    );
    interaction
        .create_response(
            &ctx.http,
            CreateInteractionResponse::UpdateMessage(
                CreateInteractionResponseMessage::new()
                    .content(updated_text)
                    .components(vec![]),
            ),
        )
        .await?;

    Ok(())
}
