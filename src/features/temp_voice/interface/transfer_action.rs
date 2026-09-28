use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice::audit;
use crate::features::temp_voice::cache;
use crate::features::temp_voice::interface::create_ephemeral_msg;
use fred::clients::Client;
use serenity::all::{
    ChannelId, ComponentInteraction, Context, CreateInteractionResponse,
    CreateInteractionResponseMessage, GuildId, PermissionOverwrite, PermissionOverwriteType,
    Permissions, UserId,
};
use tracing::{debug, error, instrument, warn};

#[instrument(skip(ctx, data), fields(acceptor_id = %interaction.user.id.get()))]
pub async fn handle_accept_transfer(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    let Some(guild_id) = interaction.guild_id else {
        debug!("transfer acceptance interaction received outside of a guild");
        return Ok(());
    };

    let Some(channel_id) = ctx.cache.guild(guild_id).and_then(|g| {
        g.voice_states
            .get(&interaction.user.id)
            .and_then(|vs| vs.channel_id)
    }) else {
        debug!("acceptor is not in a voice channel");
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

    // The stored owner is a string, and the ownership change above has already committed. The
    // audit entry is the record of the action, so a hole in one is worth an operator seeing.
    match current_owner.parse::<u64>() {
        Ok(from_owner) => audit::transfer_accepted(
            guild_id,
            channel_id,
            UserId::new(from_owner),
            interaction.user.id,
        ),
        Err(e) => error!(
            error = ?e,
            %guild_id,
            %channel_id,
            stored_owner = %current_owner,
            "temp voice transfer committed without an audit entry; the stored owner is not a user id"
        ),
    }

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
        debug!(%channel_id, "transfer acceptance found no pending key in redis");
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
            %channel_id,
            acceptor_id = %interaction.user.id,
            expected_owner = %target_owner,
            "transfer acceptance rejected, acceptor is not the designated target"
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
        warn!(%channel_id, "no current owner recorded in redis for active channel");
        return Ok(None);
    };

    let acceptor_existing_vc = cache::get_owned_channel_id(redis, guild_id, &target_owner).await?;
    if let Some(existing_channel) = acceptor_existing_vc
        && existing_channel != channel_id.get().to_string()
    {
        debug!(
            %channel_id,
            acceptor_id = %interaction.user.id,
            existing_channel = %existing_channel,
            "acceptor now owns a different temp vc, refusing to complete transfer"
        );
        if let Err(e) = cache::clear_pending_transfer(redis, channel_id).await {
            warn!(%channel_id, error = ?e, "pending transfer not cleared during validation");
        }
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

    if let Err(e) = channel_id.create_permission(&ctx.http, new_overwrite).await {
        warn!(
            %channel_id,
            %new_owner_id,
            error = ?e,
            "new owner channel permission not applied"
        );
        return Ok(false);
    }

    debug!(%channel_id, %new_owner_id, "new owner channel permission applied");

    if let Ok(old_owner_id) = current_owner_str.parse::<u64>() {
        let old_owner_overwrite = PermissionOverwrite {
            allow: Permissions::VIEW_CHANNEL | Permissions::CONNECT,
            deny: Permissions::empty(),
            kind: PermissionOverwriteType::Member(UserId::new(old_owner_id)),
        };
        if let Err(e) = channel_id
            .create_permission(&ctx.http, old_owner_overwrite)
            .await
        {
            warn!(
                %channel_id,
                old_owner_id,
                error = ?e,
                "old owner's permission demotion failed"
            );
        } else {
            debug!(
                %channel_id,
                old_owner_id,
                "old owner demoted to member-level permissions"
            );
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
        debug!("transfer decline interaction received outside of a guild");
        return Ok(());
    };

    let Some(channel_id) = ctx.cache.guild(guild_id).and_then(|g| {
        g.voice_states
            .get(&interaction.user.id)
            .and_then(|vs| vs.channel_id)
    }) else {
        debug!("decliner is not in a voice channel");
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
        debug!(%channel_id, "transfer decline found no pending key in redis");
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
            %channel_id,
            decliner_id = %interaction.user.id,
            expected_owner = %target_owner,
            "transfer decline rejected, decliner is not the designated target"
        );
        interaction
            .create_response(
                &ctx.http,
                create_ephemeral_msg("This transfer offer wasn't made for you!"),
            )
            .await?;
        return Ok(());
    }

    if let Err(e) = cache::clear_pending_transfer(redis, channel_id).await {
        warn!(%channel_id, error = ?e, "pending transfer not cleared on decline");
    }

    if let Ok(target) = target_owner.parse::<u64>() {
        audit::transfer_declined(guild_id, channel_id, UserId::new(target));
    }

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
