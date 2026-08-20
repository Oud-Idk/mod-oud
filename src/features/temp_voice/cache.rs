use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice::keys;
use fred::clients::Client;
use fred::interfaces::{HashesInterface, KeysInterface};
use fred::prelude::Expiration;
use serenity::all::{ChannelId, GuildId, UserId};
use tracing::{debug, error, warn};

pub async fn get_owned_temp_vc(
    data: &BotData,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Option<ChannelId>, Error> {
    get_user_owned_channel(&data.core.redis, guild_id, user_id).await
}

pub async fn get_user_owned_channel(
    redis: &Client,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Option<ChannelId>, Error> {
    let key = keys::temp_vc_owners_key(guild_id);
    let field = user_id.get().to_string();

    let channel_id: Option<String> = redis.hget(&key, &field).await?;
    Ok(channel_id
        .and_then(|s| s.parse::<u64>().ok())
        .map(ChannelId::new))
}

pub async fn get_temp_vc_owner(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
) -> Result<Option<String>, Error> {
    let key = keys::temp_vcs_key(guild_id);
    Ok(redis.hget(&key, channel_id.get().to_string()).await?)
}

pub async fn get_owned_channel_id(
    redis: &Client,
    guild_id: GuildId,
    owner_id_str: &str,
) -> Result<Option<String>, Error> {
    let key = keys::temp_vc_owners_key(guild_id);
    Ok(redis.hget(&key, owner_id_str).await?)
}

pub async fn get_hub_cache(redis: &Client, cache_key: &str) -> Result<Option<String>, Error> {
    Ok(redis.get(cache_key).await?)
}

pub async fn register_temp_vc(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    owner_user_id: UserId,
) -> Result<(), Error> {
    let temp_vc_hash = keys::temp_vcs_key(guild_id);
    let owner_hash = keys::temp_vc_owners_key(guild_id);
    let temp_vc_field = channel_id.get().to_string();

    let pipe = redis.pipeline();
    pipe.hset::<(), _, _>(
        &temp_vc_hash,
        vec![(temp_vc_field.clone(), owner_user_id.get().to_string())],
    )
    .await?;
    pipe.hset::<(), _, _>(
        &owner_hash,
        vec![(owner_user_id.get().to_string(), temp_vc_field)],
    )
    .await?;
    if let Err(e) = pipe.all::<Vec<i64>>().await {
        warn!("Failed to cache new temp VC in redis: {:?}", e);
    }
    Ok(())
}

pub async fn unregister_temp_vc(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    owner_user_id: UserId,
) -> Result<(), Error> {
    let temp_vc_hash = keys::temp_vcs_key(guild_id);
    let owner_hash = keys::temp_vc_owners_key(guild_id);
    let temp_vc_field = channel_id.get().to_string();
    let owner_field = owner_user_id.get().to_string();

    let pipe = redis.pipeline();
    pipe.hdel::<(), _, _>(&temp_vc_hash, &temp_vc_field).await?;
    pipe.hdel::<(), _, _>(&owner_hash, &owner_field).await?;
    if let Err(e) = pipe.all::<Vec<i64>>().await {
        warn!("Failed to clean up temp VC entries: {:?}", e);
    }
    Ok(())
}

pub async fn cleanup_temp_vc_entries(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    owner_id: Option<&str>,
) -> Result<(), Error> {
    let temp_vc_hash = keys::temp_vcs_key(guild_id);
    let owner_hash = keys::temp_vc_owners_key(guild_id);
    let temp_vc_field = channel_id.get().to_string();

    if let Some(owner_id) = owner_id {
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
    Ok(())
}

pub async fn delete_temp_vc_entries(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    user_id: UserId,
) -> Result<(), Error> {
    let temp_vc_hash = keys::temp_vcs_key(guild_id);
    let owner_hash = keys::temp_vc_owners_key(guild_id);
    let temp_vc_field = channel_id.get().to_string();
    let user_id_field = user_id.get().to_string();

    let del_vc_fut = redis.hdel::<(), _, _>(&temp_vc_hash, &temp_vc_field);
    let del_owner_fut = redis.hdel::<(), _, _>(&owner_hash, &user_id_field);

    let (r1, r2) = tokio::join!(del_vc_fut, del_owner_fut);
    if let Err(e) = r1 {
        warn!("Failed to delete temp VC mapping from cache: {:?}", e);
    }
    if let Err(e) = r2 {
        warn!(
            "Failed to delete owner reverse index mapping from cache: {:?}",
            e
        );
    }

    Ok(())
}

pub async fn get_pending_transfer_target(
    redis: &Client,
    channel_id: ChannelId,
) -> Result<Option<String>, Error> {
    Ok(redis.get(keys::pending_transfer_key(channel_id)).await?)
}

pub async fn clear_pending_transfer(redis: &Client, channel_id: ChannelId) -> Result<(), Error> {
    let pending_key = keys::pending_transfer_key(channel_id);
    let _: () = redis.del(pending_key).await?;
    Ok(())
}

pub async fn store_pending_transfer(
    redis: &Client,
    channel_id: ChannelId,
    new_owner_id: UserId,
) -> Result<(), Error> {
    let pending_key = keys::pending_transfer_key(channel_id);
    let _: () = redis
        .set(
            &pending_key,
            new_owner_id.get().to_string(),
            Some(Expiration::EX(90)),
            None,
            false,
        )
        .await?;
    Ok(())
}

/// Executes the atomic pipeline to finalize the owner change in Redis.
pub async fn commit_transfer_to_redis(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    current_owner: &str,
    target_owner: &str,
) -> Result<(), Error> {
    debug!("Executing Redis pipeline to finalize transfer");
    let temp_vc_hash = keys::temp_vcs_key(guild_id);
    let owner_hash = keys::temp_vc_owners_key(guild_id);
    let pending_key = keys::pending_transfer_key(channel_id);

    let pipe = redis.pipeline();
    pipe.hset::<(), _, _>(
        &temp_vc_hash,
        vec![(channel_id.get().to_string(), target_owner.to_string())],
    )
    .await?;
    pipe.hdel::<(), _, _>(&owner_hash, current_owner).await?;
    pipe.hset::<(), _, _>(
        &owner_hash,
        vec![(target_owner.to_string(), channel_id.get().to_string())],
    )
    .await?;
    pipe.del::<(), _>(&pending_key).await?;

    if let Err(e) = pipe.all::<Vec<i64>>().await {
        error!("Failed to execute Redis pipeline: {:?}", e);
        return Err(e.into());
    }

    Ok(())
}
