use crate::features::temp_voice::interface::create_ephemeral_msg;
use crate::{Data, Error};
use fred::interfaces::{HashesInterface, KeysInterface};
use serenity::all::{
    ComponentInteraction, Context, CreateInteractionResponse, CreateInteractionResponseMessage,
    PermissionOverwrite, PermissionOverwriteType, Permissions, UserId,
};
use tracing::{debug, error, info, instrument, warn};

#[instrument(skip(ctx, data), fields(acceptor_id = %interaction.user.id.get()))]
pub(crate) async fn handle_accept_transfer(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = match interaction.guild_id {
        Some(g) => g,
        None => {
            debug!("Transfer acceptance interaction received outside of a guild");
            return Ok(());
        }
    };

    let Some(channel_id) = ctx.cache.guild(guild_id).and_then(|g| {
        g.voice_states.get(&interaction.user.id).and_then(|vs| vs.channel_id)
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

    let redis = &data.redis;
    let pending_key = format!("temp_vc_pending_transfer:{}", channel_id);
    let target_owner_str: Option<String> = redis.get(&pending_key).await?;

    let Some(target_owner) = target_owner_str else {
        debug!("Transfer acceptance failed: No pending key in Redis or key expired for channel {}", channel_id.get());
        interaction
            .create_response(&ctx.http, create_ephemeral_msg("No pending transfer request found, or it expired!"))
            .await?;
        return Ok(());
    };

    if target_owner != interaction.user.id.get().to_string() {
        debug!(
            "Transfer acceptance rejected: User {} is not the designated target {}",
            interaction.user.id.get(),
            target_owner
        );
        interaction
            .create_response(&ctx.http, create_ephemeral_msg("This transfer offer wasn't made for you!"))
            .await?;
        return Ok(());
    }

    let temp_vc_hash = format!("temp_vcs:{}", guild_id);
    let owner_hash = format!("temp_vc_owners:{}", guild_id);
    let current_owner_str: Option<String> = redis.hget(&temp_vc_hash, channel_id.get().to_string()).await?;

    let Some(current_owner) = current_owner_str else {
        warn!("No current owner recorded in Redis for active channel {}", channel_id.get());
        return Ok(());
    };

    let acceptor_existing_vc: Option<String> = redis.hget(&owner_hash, &target_owner).await?;
    if let Some(existing_channel) = acceptor_existing_vc {
        if existing_channel != channel_id.get().to_string() {
            warn!(
                acceptor_id = %interaction.user.id.get(),
                existing_channel = %existing_channel,
                offered_channel = %channel_id.get(),
                "Acceptor now owns a different temp VC; refusing to complete transfer"
            );
            let _: Result<(), _> = redis.del(&pending_key).await;
            interaction
                .create_response(
                    &ctx.http,
                    create_ephemeral_msg(
                        "You already own a different temporary voice channel now, so this offer is no longer valid!",
                    ),
                )
                .await?;
            return Ok(());
        }
    }

    let new_overwrite = PermissionOverwrite {
        allow: Permissions::VIEW_CHANNEL
            | Permissions::CONNECT
            | Permissions::MANAGE_CHANNELS
            | Permissions::MOVE_MEMBERS
            | Permissions::MUTE_MEMBERS
            | Permissions::DEAFEN_MEMBERS,
        deny: Permissions::empty(),
        kind: PermissionOverwriteType::Member(interaction.user.id),
    };

    debug!("Applying new channel permissions for user {}", interaction.user.id.get());
    if let Err(e) = channel_id.create_permission(&ctx.http, new_overwrite).await {
        error!("Failed to apply permission override to Discord API: {:?}", e);
        interaction
            .create_response(&ctx.http, create_ephemeral_msg("Discord API error. Try again!"))
            .await?;
        return Ok(());
    }

    if let Ok(old_owner_id) = current_owner.parse::<u64>() {
        let old_owner_overwrite = PermissionOverwrite {
            allow: Permissions::VIEW_CHANNEL | Permissions::CONNECT,
            deny: Permissions::empty(),
            kind: PermissionOverwriteType::Member(UserId::new(old_owner_id)),
        };
        debug!("Demoting old owner {} to member-level permissions", old_owner_id);
        if let Err(e) = channel_id.create_permission(&ctx.http, old_owner_overwrite).await {
            warn!("Failed to demote old owner's permissions: {:?}", e);
        }
    }

    debug!("Executing Redis pipeline to finalize transfer");
    let pipe = redis.pipeline();
    pipe.hset::<(), _, _>(&temp_vc_hash, vec![(channel_id.get().to_string(), target_owner.clone())]).await?;
    pipe.hdel::<(), _, _>(&owner_hash, &current_owner).await?;
    pipe.hset::<(), _, _>(&owner_hash, vec![(target_owner.clone(), channel_id.get().to_string())]).await?;
    pipe.del::<(), _>(&pending_key).await?;

    if let Err(e) = pipe.all::<Vec<i64>>().await {
        error!("Failed to execute Redis pipeline: {:?}", e);
        return Err(e.into());
    }

    info!(
        "Successfully transferred channel {} from owner {} to {}",
        channel_id.get(),
        current_owner,
        target_owner
    );

    let updated_text = format!("<@{}> accepted the offer and is now the owner of this channel!", interaction.user.id);
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

#[instrument(skip(ctx, data), fields(decliner_id = %interaction.user.id.get()))]
pub(crate) async fn handle_decline_transfer(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = match interaction.guild_id {
        Some(g) => g,
        None => {
            debug!("Transfer decline interaction received outside of a guild");
            return Ok(());
        }
    };

    let Some(channel_id) = ctx.cache.guild(guild_id).and_then(|g| {
        g.voice_states.get(&interaction.user.id).and_then(|vs| vs.channel_id)
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

    let redis = &data.redis;
    let pending_key = format!("temp_vc_pending_transfer:{}", channel_id);
    let target_owner_str: Option<String> = redis.get(&pending_key).await?;

    let Some(target_owner) = target_owner_str else {
        debug!("Transfer decline failed: No pending key in Redis or key expired for channel {}", channel_id.get());
        interaction
            .create_response(&ctx.http, create_ephemeral_msg("No pending transfer request found, or it expired!"))
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
            .create_response(&ctx.http, create_ephemeral_msg("This transfer offer wasn't made for you!"))
            .await?;
        return Ok(());
    }

    debug!("Deleting pending transfer key from Redis for channel {}", channel_id.get());
    let _: Result<(), _> = redis.del(&pending_key).await;

    info!(
        "Transfer request for channel {} was declined by user {}",
        channel_id.get(),
        interaction.user.id.get()
    );

    let updated_text = format!("❌ **Transfer Declined**\n<@{}> decided they didn't want the crown today.", interaction.user.id);
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