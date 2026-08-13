use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice::database::get_hub_info_by_category;
use crate::features::temp_voice::keys;
use crate::features::temp_voice::keys::{temp_vc_owners_key, temp_vcs_key};
use crate::features::temp_voice::placeholders::replace_channel_placeholders;
use crate::shared::voice_state::get_user_vc_in_guild;
use anyhow::Context as _;
use fred::clients::Client as RedisClient;
use fred::interfaces::{HashesInterface, KeysInterface};
use fred::prelude::Expiration;
use serenity::all::{Channel, ChannelId, Context, EditChannel, EditMember, GuildId, Http, Member, PermissionOverwrite, PermissionOverwriteType, Permissions, RoleId, UserId};
use sqlx::PgPool;

/// Service: Rename Temp Voice Channel
pub async fn rename_temp_vc(
    ctx: &Context,
    redis: &RedisClient,
    db: &PgPool,
    guild_id: GuildId,
    channel_id: ChannelId,
    member: &Member,
    raw_name: &str,
) -> Result<String, Error> {
    let trimmed = raw_name.trim();

    let final_name = if trimmed.is_empty() {
        let guild_channel = Channel::guild(channel_id.to_channel(&ctx).await?).with_context(|| "Channel not found")?;
        let category_id = guild_channel.parent_id.with_context(|| "Channel has no category parent")?;

        let cache_key = format!("temp_voice_hub_by_category:{guild_id}:{category_id}");
        let cached_json: Option<String> = redis.get(&cache_key).await?;

        let hub_info = get_hub_info_by_category(guild_id, redis, db, category_id, &cache_key, cached_json)
            .await?
            .with_context(|| "No hub config found")?;

        replace_channel_placeholders(&hub_info.default_channel_name, &guild_id, ctx, member).await?
    } else {
        replace_channel_placeholders(trimmed, &guild_id, ctx, member).await?
    };

    match channel_id.edit(&ctx, EditChannel::new().name(&final_name)).await {
        Ok(_) => Ok(format!("Renamed the channel to **{final_name}**.")),
        Err(serenity::Error::Http(http_err)) if http_err.status_code() == Some(serenity::all::StatusCode::TOO_MANY_REQUESTS) => {
            Ok("This channel was renamed too recently. Discord limits renames to 2 per 10 minutes.".to_string())
        }
        Err(e) => Err(e.into()),
    }
}

/// Service: Disconnect a specific `UserId` from a voice channel
pub async fn kick_user_by_id(
    http: &Http,
    guild_id: GuildId,
    target_user_id: UserId,
) -> Result<String, Error> {
    let edit_builder = EditMember::new().disconnect_member();

    match guild_id.edit_member(http, target_user_id, edit_builder).await {
        Ok(_) => Ok(format!("Successfully kicked <@{target_user_id}> from the channel.")),
        Err(err) => {
            tracing::error!("Failed to disconnect member {}: {:?}", target_user_id, err);
            Ok("Could not kick the user. Do I have the 'Move Members' permission?".to_string())
        }
    }
}

/// Service: Search for a user in the voice channel by string query (name/ID) and kick them
pub async fn kick_user_by_query(
    ctx: &Context,
    guild_id: GuildId,
    channel_id: ChannelId,
    query: &str,
) -> Result<String, Error> {
    let query_trimmed = query.trim();
    if query_trimmed.is_empty() {
        return Ok("Please provide a name or ID to kick.".to_string());
    }

    // Isolate cache lookup to get user IDs currently inside the voice channel
    let user_ids_in_vc = {
        ctx.cache.guild(guild_id).map(|guild| {
            guild
                .voice_states
                .iter()
                .filter(|(_, state)| state.channel_id == Some(channel_id))
                .map(|(user_id, _)| *user_id)
                .collect::<Vec<UserId>>()
        })
    };

    let Some(user_ids_in_vc) = user_ids_in_vc else {
        return Ok("Failed to access server cache. Please try again later.".to_string());
    };

    let mut target_user_id: Option<UserId> = None;

    // 1. Try parsing exact ID
    if let Ok(parsed_id) = query_trimmed.parse::<u64>() {
        let parsed_user_id = UserId::new(parsed_id);
        if user_ids_in_vc.contains(&parsed_user_id) {
            target_user_id = Some(parsed_user_id);
        }
    }

    // 2. Try case-insensitive substring match on username / nickname
    if target_user_id.is_none() {
        let query_lower = query_trimmed.to_lowercase();

        for user_id in &user_ids_in_vc {
            if let Ok(member) = guild_id.member(ctx, user_id).await {
                let name_match = member.user.name.to_lowercase().contains(&query_lower);
                let nick_match = member
                    .nick
                    .as_ref()
                    .is_some_and(|n| n.to_lowercase().contains(&query_lower));

                if name_match || nick_match {
                    target_user_id = Some(*user_id);
                    break;
                }
            }
        }
    }

    let Some(target_id) = target_user_id else {
        return Ok("Could not find a user in your voice channel matching that name or ID.".to_string());
    };

    // Kick the resolved user
    kick_user_by_id(&ctx.http, guild_id, target_id).await
}

/// Service: Set the user limit for a temporary voice channel
pub async fn set_temp_vc_limit(
    ctx: &Context,
    channel_id: ChannelId,
    raw_limit: &str,
) -> Result<String, Error> {
    let limit_trimmed = raw_limit.trim();
    let limit_parsed = if limit_trimmed.is_empty() {
        0
    } else {
        match limit_trimmed.parse::<u32>() {
            Ok(num) => num,
            Err(_) => {
                return Ok("Input isn't valid or is negative. \
                    Please enter a number between 1 and 99, or leave it blank to reset. \
                    0 is an alias for resetting too.".to_string());
            }
        }
    };

    if limit_parsed > 99 {
        return Ok("Limit is too big. Please try again.".to_string());
    }

    let builder = EditChannel::new().user_limit(limit_parsed);
    match channel_id.edit(&ctx, builder).await {
        Ok(_) => Ok(format!("Success! The voice channel limit is now set to {limit_parsed}.")),
        Err(err) => {
            tracing::error!("Failed to edit channel {channel_id}: {:?}", err);
            Ok("Uh oh, I couldn't update the limit. \
                Do I have the 'Manage Channels' permission?".to_string())
        }
    }
}

/// Service: Delete a temporary voice channel and clean up Redis entries
pub async fn delete_temp_vc(
    http: &Http,
    redis: &RedisClient,
    guild_id: GuildId,
    channel_id: ChannelId,
    user_id: UserId,
) -> Result<String, Error> {
    let temp_vc_hash = temp_vcs_key(guild_id);
    let temp_vc_field = channel_id.get().to_string();

    let owner_id_str: Option<String> = redis.hget(&temp_vc_hash, &temp_vc_field).await?;

    let is_owner = match owner_id_str {
        Some(ref id) => id == &user_id.get().to_string(),
        None => false,
    };

    if !is_owner {
        return Ok("You don't own this channel! Only the channel owner can delete it.".to_string());
    }

    tracing::debug!(channel_id = channel_id.get(), "Owner requested manual deletion of temp VC. Cleaning up.");

    if let Err(e) = channel_id.delete(http).await {
        tracing::error!("Failed to delete temp VC {}: {:?}", channel_id, e);
        return Ok("Could not delete the channel. Do I have the 'Manage Channels' permission?".to_string());
    }

    let owner_hash = temp_vc_owners_key(guild_id);
    let user_id_field = user_id.get().to_string();

    let del_vc_fut = redis.hdel::<(), _, _>(&temp_vc_hash, &temp_vc_field);
    let del_owner_fut = redis.hdel::<(), _, _>(&owner_hash, &user_id_field);

    let (r1, r2) = tokio::join!(del_vc_fut, del_owner_fut);
    if let Err(e) = r1 {
        tracing::warn!("Failed to delete temp VC mapping from cache: {:?}", e);
    }
    if let Err(e) = r2 {
        tracing::warn!("Failed to delete owner reverse index mapping from cache: {:?}", e);
    }

    Ok("Your voice channel has been deleted.".to_string())
}

/// Service: Initiate a transfer of ownership for a temporary voice channel
pub async fn initiate_temp_vc_transfer(
    _ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
    channel_id: ChannelId,
    current_owner_id: UserId,
    new_owner_id: UserId,
) -> Result<String, Error> {
    let redis = &data.core.redis;

    if new_owner_id == current_owner_id {
        return Ok("You can't transfer to yourself!".to_string());
    }

    if get_user_vc_in_guild(data, guild_id, new_owner_id).await? == None {
        tracing::debug!(
            "Target user {} is not present in channel {}",
            new_owner_id.get(),
            channel_id.get()
        );
        return Ok("The recipient must be in the voice channel!".to_string());
    }

    let owner_hash = temp_vc_owners_key(guild_id);

    let target_existing_vc: Option<String> = redis.hget(&owner_hash, new_owner_id.get().to_string()).await?;
    if target_existing_vc.is_some() {
        tracing::debug!("Transfer rejected: Target user already owns a temporary voice channel");
        return Ok("That user already owns a temporary voice channel!".to_string());
    }

    let pending_key = keys::pending_transfer_key(channel_id);
    redis
        .set::<(), _, _>(
            &pending_key,
            new_owner_id.get().to_string(),
            Some(Expiration::EX(90)),
            None,
            false,
        )
        .await?;

    tracing::debug!("Pending transfer state written to Redis with 90s TTL");

    Ok("Transfer offer sent! Waiting for them to accept...".to_string())
}

/// Service: Lock a temporary voice channel by denying CONNECT to @everyone
pub async fn lock_temp_vc(
    http: &Http,
    guild_id: GuildId,
    channel_id: ChannelId,
) -> Result<String, Error> {
    tracing::debug!("Locking voice channel: {}", channel_id);

    let overwrite = PermissionOverwrite {
        allow: Permissions::empty(),
        deny: Permissions::CONNECT,
        kind: PermissionOverwriteType::Role(RoleId::new(guild_id.get())),
    };

    channel_id.create_permission(http, overwrite).await?;

    Ok("This channel is now **locked**. Members will no longer be able to join unless trusted.".to_string())
}

/// Service: Unlock a temporary voice channel by removing the @everyone permission overwrite
pub async fn unlock_temp_vc(
    http: &Http,
    guild_id: GuildId,
    channel_id: ChannelId,
) -> Result<String, Error> {
    tracing::debug!("Unlocking voice channel: {}", channel_id);

    let target = PermissionOverwriteType::Role(RoleId::new(guild_id.get()));

    if let Err(e) = channel_id.delete_permission(http, target).await {
        match e {
            serenity::Error::Http(ref http_err) => {
                if http_err.status_code() != Some(serenity::all::StatusCode::NOT_FOUND) {
                    return Err(e.into());
                }
            }
            _ => return Err(e.into()),
        }
    }

    Ok("This channel is now **unlocked** and open for everyone to join.".to_string())
}

/// Service: Trust users in a temporary voice channel by allowing CONNECT
pub async fn trust_users_in_vc(
    http: &Http,
    channel_id: ChannelId,
    target_user_ids: Vec<UserId>,
    caller_id: UserId,
) -> Result<String, Error> {
    let filtered_ids: Vec<UserId> = target_user_ids
        .into_iter()
        .filter(|id| *id != caller_id)
        .collect();

    if filtered_ids.is_empty() {
        return Ok("You can't trust yourself! You already own the channel.".to_string());
    }

    let mut trusted_mentions = Vec::new();

    for target_user_id in filtered_ids {
        tracing::debug!("Trusting user {} in channel {}", target_user_id, channel_id);

        let overwrite = PermissionOverwrite {
            allow: Permissions::VIEW_CHANNEL | Permissions::CONNECT,
            deny: Permissions::empty(),
            kind: PermissionOverwriteType::Member(target_user_id),
        };

        channel_id.create_permission(http, overwrite).await?;
        trusted_mentions.push(format!("<@{target_user_id}>"));
    }

    Ok(format!(
        "The following users are now **trusted** and can join this channel: {}",
        trusted_mentions.join(", ")
    ))
}

/// Service: Untrust users in a temporary voice channel by removing their permission overwrite
pub async fn untrust_users_in_vc(
    http: &Http,
    channel_id: ChannelId,
    target_user_ids: Vec<UserId>,
) -> Result<String, Error> {
    if target_user_ids.is_empty() {
        return Ok("No users specified.".to_string());
    }

    let mut untrusted_mentions = Vec::new();

    for target_user_id in target_user_ids {
        tracing::debug!("Untrusting user {} in channel {}", target_user_id, channel_id);
        let target = PermissionOverwriteType::Member(target_user_id);

        if let Err(e) = channel_id.delete_permission(http, target).await {
            match e {
                serenity::Error::Http(ref http_err) => {
                    if http_err.status_code() != Some(serenity::all::StatusCode::NOT_FOUND) {
                        return Err(e.into());
                    }
                }
                _ => return Err(e.into()),
            }
        }
        untrusted_mentions.push(format!("<@{target_user_id}>"));
    }

    Ok(format!("Removed {} from the trusted list.", untrusted_mentions.join(", ")))
}

/// Service: Block users from a temporary voice channel by denying `VIEW_CHANNEL` and CONNECT
pub async fn block_users_from_vc(
    http: &Http,
    guild_id: GuildId,
    channel_id: ChannelId,
    target_user_ids: Vec<UserId>,
    caller_id: UserId,
) -> Result<String, Error> {
    let filtered_ids: Vec<UserId> = target_user_ids
        .into_iter()
        .filter(|id| *id != caller_id)
        .collect();

    if filtered_ids.is_empty() {
        return Ok("You can't block yourself! Who would run the channel?".to_string());
    }

    let mut blocked_mentions = Vec::new();

    for target_user_id in filtered_ids {
        tracing::debug!("Blocking user {} in channel {}", target_user_id, channel_id);

        let overwrite = PermissionOverwrite {
            allow: Permissions::empty(),
            deny: Permissions::VIEW_CHANNEL | Permissions::CONNECT,
            kind: PermissionOverwriteType::Member(target_user_id),
        };

        channel_id.create_permission(http, overwrite).await?;

        let _ = guild_id.disconnect_member(http, target_user_id).await;
        blocked_mentions.push(format!("<@{target_user_id}>"));
    }

    Ok(format!(
        "The following users have been **blocked** and kicked from this channel: {}",
        blocked_mentions.join(", ")
    ))
}

/// Service: Unblock users from a temporary voice channel by removing their permission overwrite
pub async fn unblock_users_from_vc(
    http: &Http,
    channel_id: ChannelId,
    target_user_ids: Vec<UserId>,
) -> Result<String, Error> {
    if target_user_ids.is_empty() {
        return Ok("No users specified.".to_string());
    }

    let mut unblocked_mentions = Vec::new();

    for target_user_id in target_user_ids {
        tracing::debug!("Unblocking user {} in channel {}", target_user_id, channel_id);
        let target = PermissionOverwriteType::Member(target_user_id);

        if let Err(e) = channel_id.delete_permission(http, target).await {
            match e {
                serenity::Error::Http(ref http_err) => {
                    if http_err.status_code() != Some(serenity::all::StatusCode::NOT_FOUND) {
                        return Err(e.into());
                    }
                }
                _ => return Err(e.into()),
            }
        }
        unblocked_mentions.push(format!("<@{target_user_id}>"));
    }

    Ok(format!("The following users have been **unblocked**: {}", unblocked_mentions.join(", ")))
}