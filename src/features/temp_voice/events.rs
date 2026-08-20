use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice;
use crate::features::temp_voice::cache;
use crate::features::temp_voice::placeholders;
use crate::features::temp_voice::types::TempVoiceHub;
use crate::shared::voice_state;
use serenity::all::{
    ChannelId, ChannelType, Context, CreateChannel, GuildChannel, GuildId, Member, VoiceState,
};
use serenity::model::id::UserId;
use tracing::{debug, trace, warn};

/// Records user voice channel join/leave state for temporary voice tracking.
///
/// # Errors
/// Returns an error if the Redis voice state write fails.
pub async fn handle_log_user_join(data: &BotData, new: &VoiceState) -> Result<(), Error> {
    let Some(guild_id) = new.guild_id else {
        return Ok(());
    };
    let user_id = new.user_id;

    debug!(user_id = user_id.get(), channel_id = ?new.channel_id, "Logging user VC join/leave");

    match new.channel_id {
        Some(channel_id) => {
            // User joined a voice channel
            voice_state::store_user_vc_on_join(data, guild_id, channel_id, user_id).await?;
        }
        None => {
            // User left a voice channel
            voice_state::delete_user_vc_on_leave(data, guild_id, user_id).await?;
        }
    }

    Ok(())
}

pub async fn handle_join_hub_temp_vc(
    ctx: &Context,
    new: &VoiceState,
    data: &BotData,
) -> Result<(), Error> {
    let user_id = new.user_id;
    let redis = &data.core.redis;
    let db = &data.core.db;

    let Some(guild_id) = new.guild_id else {
        return Ok(());
    };

    let Some(target_channel_id) = new.channel_id else {
        debug!("Unable to get voice channel ID for some reason");
        return Ok(());
    };

    let Some(member) = &new.member else {
        debug!("Unable to get member for some reason");
        return Ok(());
    };

    trace!("Handling temp voice channel.");

    let cache_key = format!("temp_voice_hub:{guild_id}:{target_channel_id}");
    let cached_json = cache::get_hub_cache(redis, &cache_key).await?;

    let Some(hub_info) = temp_voice::database::get_hub_info(
        guild_id,
        redis,
        db,
        target_channel_id,
        &cache_key,
        cached_json,
    )
    .await?
    else {
        debug!("User not in voice hub. Skipping.");
        return Ok(());
    };

    // 1. Try to route to an existing VC if one exists
    let handled = try_handle_existing_vc(ctx, data, guild_id, user_id).await?;

    if handled {
        return Ok(());
    }

    // Create, register, and move member to the new temp VC
    create_and_setup_temp_vc(ctx, data, guild_id, member, user_id, &hub_info).await?;

    Ok(())
}

/// Checks if the user already has a temp VC and handles moving them or cleaning stale Redis entries.
/// Returns `Ok(true)` if the user was moved to an existing VC.
async fn try_handle_existing_vc(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<bool, Error> {
    let existing_channel =
        cache::get_user_owned_channel(&data.core.redis, guild_id, user_id).await?;

    if let Some(existing_channel_id) = existing_channel {
        let still_exists = ctx
            .cache
            .guild(guild_id)
            .is_some_and(|g| g.channels.contains_key(&existing_channel_id));

        if still_exists {
            debug!(
                user_id = user_id.get(),
                channel_id = existing_channel_id.get(),
                "User already owns a temp VC; moving them there instead of creating a new one."
            );
            if let Err(e) = guild_id
                .move_member(&ctx, user_id, existing_channel_id)
                .await
            {
                warn!(
                    user_id = user_id.get(),
                    channel_id = existing_channel_id.get(),
                    error = %e,
                    "Failed to move member into their existing temp VC",
                );
                return Err(e.into());
            }
            return Ok(true);
        }

        warn!(
            user_id = user_id.get(),
            channel_id = existing_channel_id.get(),
            "Owner hash pointed at a channel that no longer exists; clearing stale entry."
        );
        cache::unregister_temp_vc(&data.core.redis, guild_id, existing_channel_id, user_id).await?;
    }

    Ok(false)
}

/// Creates a new temp VC, registers it in Redis, and moves the member with rollback on failure.
async fn create_and_setup_temp_vc(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
    member: &Member,
    user_id: UserId,
    hub_info: &TempVoiceHub,
) -> Result<(), Error> {
    let new_channel = create_temp_vc(ctx, &guild_id, member, hub_info).await?;
    debug!(
        new_channel_id = new_channel.id.get(),
        "Created temp voice channel."
    );

    cache::register_temp_vc(&data.core.redis, guild_id, new_channel.id, user_id).await?;

    if let Err(e) = guild_id.move_member(&ctx, user_id, new_channel.id).await {
        rollback_temp_vc(ctx, data, guild_id, user_id, new_channel.id).await?;

        warn!(
            user_id = user_id.get(),
            new_channel_id = new_channel.id.get(),
            "Couldn't move member to new channel",
        );

        return Err(e.into());
    }

    debug!(
        user_id = user_id.get(),
        new_channel_id = new_channel.id.get(),
        "Moved member into voice channel."
    );

    Ok(())
}

/// Cleans up the newly created channel and rolls back its Redis cache entries on error.
async fn rollback_temp_vc(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
    user_id: UserId,
    new_channel_id: ChannelId,
) -> Result<(), Error> {
    // If the member is magically faster than my network (which is very much possible with my
    // 300ms ass latency), clean up the new channel.
    if let Err(cleanup_err) = new_channel_id.delete(&ctx.http).await {
        warn!(
            new_channel_id = new_channel_id.get(),
            error = %cleanup_err,
            "Failed to clean up orphaned temp voice channel",
        );
    }

    // rollback pipe
    cache::unregister_temp_vc(&data.core.redis, guild_id, new_channel_id, user_id).await?;

    Ok(())
}

pub async fn handle_leave_temp_vc(
    ctx: &Context,
    old: Option<&VoiceState>,
    new: &VoiceState,
    data: &BotData,
) -> Result<(), Error> {
    let redis = &data.core.redis;

    let Some(guild_id) = new.guild_id else {
        return Ok(());
    };

    let Some(old_state) = old else {
        trace!("Old VC state unavailable, skipping.");
        return Ok(());
    };

    let Some(old_channel_id) = old_state.channel_id else {
        debug!("Old VC channel ID is missing, skipping.");
        return Ok(());
    };

    // Check if the left channel is a temporary VC
    let is_temp = cache::get_temp_vc_owner(redis, guild_id, old_channel_id).await?;

    if is_temp.is_some() {
        let is_empty = if let Some(guild) = ctx.cache.guild(guild_id) {
            let count = guild
                .voice_states
                .values()
                .filter(|state| state.channel_id == Some(old_channel_id))
                .count();
            count == 0
        } else {
            false
        };

        if is_empty {
            debug!(
                channel_id = old_channel_id.get(),
                "Temp VC is empty. Cleaning up."
            );

            if let Err(e) = old_channel_id.delete(&ctx.http).await {
                warn!(
                    channel_id = old_channel_id.get(),
                    "Failed to delete empty temp VC on Discord: {:?}", e
                );
            } else {
                debug!(channel_id = old_channel_id.get(), "Deleted empty temp VC.");
            }

            cache::cleanup_temp_vc_entries(redis, guild_id, old_channel_id, is_temp.as_deref())
                .await?;
        }
    }

    Ok(())
}

pub async fn create_temp_vc(
    ctx: &Context,
    guild_id: &GuildId,
    member: &Member,
    hub_info: &TempVoiceHub,
) -> Result<GuildChannel, anyhow::Error> {
    let Some(category_id) = hub_info.category_id else {
        anyhow::bail!("Category ID is not specified");
    };
    let channel_name = placeholders::replace_channel_placeholders(
        hub_info.default_channel_name.as_str(),
        guild_id,
        ctx,
        member,
    )
    .await?;

    let mut channel_builder = CreateChannel::new(channel_name)
        .kind(ChannelType::Voice)
        .category(category_id);

    if let Some(limit) = hub_info.user_limit
        && limit > 0
    {
        channel_builder = channel_builder.user_limit(u32::try_from(limit).unwrap_or(0));
    }

    let new_channel = guild_id.create_channel(&ctx, channel_builder).await?;
    debug!(
        new_channel_id = new_channel.id.get(),
        "Created temp voice channel."
    );
    Ok(new_channel)
}

/// Routes voice state changes to temporary voice channel join and leave handling.
///
/// # Errors
/// Returns an error if a temp voice channel cannot be created, cleaned up, or
/// its Redis state updated.
pub async fn handle_voice_event(
    ctx: &Context,
    old: Option<&VoiceState>,
    new: &VoiceState,
    data: &BotData,
) -> Result<(), Error> {
    handle_join_hub_temp_vc(ctx, new, data).await?;
    handle_leave_temp_vc(ctx, old, new, data).await?;
    Ok(())
}
