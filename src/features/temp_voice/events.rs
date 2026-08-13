use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice;
use crate::features::temp_voice::keys::{temp_vc_owners_key, temp_vcs_key};
use crate::features::temp_voice::types::TempVoiceHub;
use crate::features::temp_voice::placeholders;
use crate::shared::voice_state;
use fred::interfaces::{HashesInterface, KeysInterface};
use serenity::all::{ChannelId, ChannelType, Context, CreateChannel, GuildChannel, GuildId, Member, VoiceState};
use tracing::{debug, trace, warn};

pub async fn handle_log_user_join(
    data: &BotData,
    new: &VoiceState
) -> Result<(), Error> {
    let Some(guild_id) = new.guild_id else {
        return Ok(());
    };
    let user_id = new.user_id;

    debug!(user_id = user_id.get(), channel_id = ?new.channel_id, "Logging user VC join/leave");

    match new.channel_id {
        Some(channel_id) => {
            // User joined a voice channel
            voice_state::store_user_vc_on_join(data, guild_id, channel_id, user_id).await?;
        },
        None => {
            // User left a voice channel
            voice_state::delete_user_vc_on_leave(data, guild_id, user_id).await?;
        },
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

    let target_channel_id = if let Some(channel_id) = new.channel_id { channel_id } else {
        debug!("Unable to get voice channel ID for some reason");
        return Ok(())
    };

    let Some(member) = &new.member else {
        debug!("Unable to get member for some reason");
        return Ok(())
    };

    trace!("Handling temp voice channel.");

    let cache_key = format!("temp_voice_hub:{guild_id}:{target_channel_id}");
    let cached_json: Option<String> = redis.get(&cache_key).await?;

    let maybe_hub = temp_voice::database::get_hub_info(guild_id, redis, db, target_channel_id, &cache_key, cached_json).await?;

    let hub_info = if let Some(info) = maybe_hub { info } else {
        debug!("User not in voice hub. Skipping.");
        return Ok(())
    };

    let owner_hash = temp_vc_owners_key(guild_id);
    let owner_field = user_id.get().to_string();
    let temp_vc_hash = temp_vcs_key(guild_id);

    let existing_channel: Option<String> = redis.hget(&owner_hash, &owner_field).await?;
    if let Some(existing_channel_str) = existing_channel
        && let Ok(existing_channel_id) = existing_channel_str.parse::<u64>() {
            let existing_channel_id = ChannelId::new(existing_channel_id);

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
                if let Err(e) = guild_id.move_member(&ctx, user_id, existing_channel_id).await {
                    warn!(
                        user_id = user_id.get(),
                        channel_id = existing_channel_id.get(),
                        error = %e,
                        "Failed to move member into their existing temp VC",
                    );
                    return Err(e.into());
                }
                return Ok(());
            } else {
                warn!(
                    user_id = user_id.get(),
                    channel_id = existing_channel_id.get(),
                    "Owner hash pointed at a channel that no longer exists; clearing stale entry."
                );
                let pipe = redis.pipeline();
                pipe.hdel::<(), _, _>(&owner_hash, &owner_field).await?;
                pipe.hdel::<(), _, _>(&temp_vc_hash, &existing_channel_str).await?;
                if let Err(e) = pipe.all::<Vec<i64>>().await {
                    warn!("Failed to clear stale owner hash entry: {:?}", e);
                }
            }
        }

    let new_channel = create_temp_vc(ctx, &guild_id, member, &hub_info).await?;
    debug!(new_channel_id = new_channel.id.get(), "Created temp voice channel.");

    let temp_vc_field = new_channel.id.get().to_string();

    let pipe = redis.pipeline();
    pipe.hset::<(), _, _>(&temp_vc_hash, vec![(temp_vc_field.clone(), user_id.get().to_string())]).await?;
    pipe.hset::<(), _, _>(&owner_hash, vec![(owner_field.clone(), new_channel.id.get().to_string())]).await?;
    if let Err(e) = pipe.all::<Vec<i64>>().await {
        warn!("Failed to cache new temp VC in redis: {:?}", e);
    }

    if let Err(e) = guild_id.move_member(&ctx, user_id, new_channel.id).await {
        // If the member is magically faster than my network (which is very much possible with my
        // 300ms ass latency), clean up the new channel.
        if let Err(cleanup_err) = new_channel.id.delete(&ctx.http).await {
            warn!(
                new_channel_id = new_channel.id.get(),
                error = %cleanup_err,
                "Failed to clean up orphaned temp voice channel",
            );
        }

        // rollback pipe
        let cleanup_pipe = redis.pipeline();
        cleanup_pipe.hdel::<(), _, _>(&temp_vc_hash, &temp_vc_field).await?;
        cleanup_pipe.hdel::<(), _, _>(&owner_hash, &owner_field).await?;
        if let Err(cleanup_err) = cleanup_pipe.all::<Vec<i64>>().await {
            warn!(
                new_channel_id = new_channel.id.get(),
                error = %cleanup_err,
                "Failed to roll back redis entries for orphaned temp voice channel",
            );
        }

        warn!(
            user_id = user_id.get(),
            new_channel_id = new_channel.id.get(),
            "Couldn't move member to new channel",
        );

        return Err(e.into());
    }

    debug!(user_id = user_id.get(), new_channel_id = new_channel.id.get(), "Moved member into voice channel.");

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

    let temp_vc_hash = temp_vcs_key(guild_id);
    let temp_vc_field = old_channel_id.get().to_string();

    // Check if the left channel is a temporary VC
    let is_temp: Option<String> = redis.hget(&temp_vc_hash, &temp_vc_field).await?;

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
            debug!(channel_id = old_channel_id.get(), "Temp VC is empty. Cleaning up.");

            if let Err(e) = old_channel_id.delete(&ctx.http).await {
                warn!(channel_id = old_channel_id.get(), "Failed to delete empty temp VC on Discord: {:?}", e);
            } else {
                debug!(channel_id = old_channel_id.get(), "Deleted empty temp VC.");
            }

            let owner_hash = temp_vc_owners_key(guild_id);

            if let Some(owner_id) = &is_temp {
                let active_channel_id: Option<String> = redis.hget(&owner_hash, owner_id).await?;

                if active_channel_id.as_deref() == Some(&temp_vc_field) {
                    let pipe = redis.pipeline();
                    pipe.hdel::<(), _, _>(&temp_vc_hash, &temp_vc_field).await?;
                    pipe.hdel::<(), _, _>(&owner_hash, owner_id).await?;

                    if let Err(e) = pipe.all::<Vec<i64>>().await {
                        warn!("Failed to clean up temp VC hash entries: {:?}", e);
                    }
                } else {
                    let _: Result<(), _> = redis.hdel::<(), _, _>(&temp_vc_hash, &temp_vc_field).await;
                }
            } else {
                let _: Result<(), _> = redis.hdel::<(), _, _>(&temp_vc_hash, &temp_vc_field).await;
            }
        }
    }

    Ok(())
}

pub async fn create_temp_vc(ctx: &Context, guild_id: &GuildId, member: &Member, hub_info: &TempVoiceHub) -> Result<GuildChannel, anyhow::Error> {
    let Some(cat_id) = hub_info.category_id.map(|id| id as u64) else {
        anyhow::bail!("Category ID is not specified");
    };
    let category_id = ChannelId::new(cat_id);
    let channel_name = placeholders::replace_channel_placeholders(hub_info.default_channel_name.as_str(), guild_id, ctx, member).await?;

    let mut channel_builder = CreateChannel::new(channel_name)
        .kind(ChannelType::Voice)
        .category(category_id);

    if let Some(limit) = hub_info.user_limit
        && limit > 0 {
            channel_builder = channel_builder.user_limit(limit as u32);
        }

    let new_channel = guild_id.create_channel(&ctx, channel_builder).await?;
    debug!(new_channel_id = new_channel.id.get(), "Created temp voice channel.");
    Ok(new_channel)
}

pub async fn handle_voice_event(ctx: &Context, old: Option<&VoiceState>, new: &VoiceState, data: &BotData) -> Result<(), Error> {
    handle_join_hub_temp_vc(ctx, new, data).await?;
    handle_leave_temp_vc(ctx, old, new, data).await?;
    Ok(())
}