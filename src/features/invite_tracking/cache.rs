use fred::{
    clients::Client,
    interfaces::{HashesInterface, KeysInterface, SetsInterface},
};
use serenity::{
    all::RichInvite,
    model::{
        event::InviteCreateEvent,
        id::{GuildId, UserId},
    },
};
use std::collections::{HashMap, HashSet};

use crate::features::invite_tracking::keys;

pub struct CachePairs<'a> {
    pub uses_items: Vec<(&'a str, u64)>,
    pub max_uses_items: Vec<(&'a str, u64)>,
    pub inviter_items: Vec<(&'a str, u64)>,
    pub codes_by_user: HashMap<UserId, Vec<&'a str>>,
}

impl CachePairs<'_> {
    pub const fn is_empty(&self) -> bool {
        self.uses_items.is_empty() && self.inviter_items.is_empty()
    }
}

pub fn collect_pairs<'a>(invites: &'a [RichInvite]) -> CachePairs<'a> {
    let len = invites.len();
    let mut uses_items = Vec::with_capacity(len);
    let mut max_uses_items = Vec::with_capacity(len);
    let mut inviter_items = Vec::with_capacity(len);
    let mut codes_by_user: HashMap<UserId, Vec<&'a str>> = HashMap::new();

    for inv in invites {
        let code = inv.code.as_str();
        uses_items.push((code, inv.uses));
        max_uses_items.push((code, u64::from(inv.max_uses)));

        if let Some(u) = &inv.inviter {
            let user_id = u.id;
            // Using raw u64 `.get()` to avoid making looping on the Redis request
            inviter_items.push((code, user_id.get()));
            codes_by_user.entry(user_id).or_default().push(code);
        }
    }

    CachePairs {
        uses_items,
        max_uses_items,
        inviter_items,
        codes_by_user,
    }
}

pub async fn store_invite_to_redis_hash(
    guild_id: GuildId,
    redis: &Client,
    invite_data: &InviteCreateEvent,
) -> Result<(), anyhow::Error> {
    let cache_key = keys::invites_key(guild_id);
    let inv_key = keys::inviters_key(guild_id);
    let max_uses_key = keys::invite_max_uses_key(guild_id);
    let pipe = redis.pipeline();
    let _: () = pipe
        .hset(&cache_key, (invite_data.code.as_str(), invite_data.uses))
        .await?;
    let _: () = pipe
        .hset(
            &max_uses_key,
            (invite_data.code.as_str(), u64::from(invite_data.max_uses)),
        )
        .await?;
    if let Some(inviter) = &invite_data.inviter {
        let _: () = pipe
            .hset(&inv_key, (invite_data.code.as_str(), inviter.id.get()))
            .await?;
        let _: () = pipe
            .sadd(
                &keys::user_invites_key(guild_id, inviter.id),
                invite_data.code.as_str(),
            )
            .await?;
    }
    let _: () = pipe.all().await?;
    Ok(())
}

pub async fn replace_guild_invites(
    redis: &Client,
    guild_id: GuildId,
    cache_pairs: CachePairs<'_>,
) -> Result<(), anyhow::Error> {
    let cache_key = keys::invites_key(guild_id);
    let inv_key = keys::inviters_key(guild_id);
    let max_uses_key = keys::invite_max_uses_key(guild_id);

    let pipe = redis.pipeline();
    let _: () = pipe.del(&cache_key).await?;
    let _: () = pipe.del(&inv_key).await?;
    let _: () = pipe.del(&max_uses_key).await?;

    if cache_pairs.is_empty() {
        let _: () = pipe.all().await?;
        return Ok(());
    }

    // Save active codes into per-user sets
    for (user_id, codes) in cache_pairs.codes_by_user {
        let user_key = keys::user_invites_key(guild_id, user_id);
        let _: () = pipe.del(&user_key).await?;
        let _: () = pipe.sadd(&user_key, codes).await?;
    }

    let _: () = pipe.hset(&cache_key, cache_pairs.uses_items).await?;
    let _: () = pipe.hset(&max_uses_key, cache_pairs.max_uses_items).await?;
    let _: () = pipe.hset(&inv_key, cache_pairs.inviter_items).await?;
    let _: () = pipe.all().await?;

    Ok(())
}

pub async fn get_user_invite_codes(
    redis: &fred::clients::Client,
    guild_id: GuildId,
    user_id: UserId,
) -> Vec<String> {
    redis
        .smembers(keys::user_invites_key(guild_id, user_id))
        .await
        .unwrap_or_default()
}

/// Removes a deleted invite code from the Redis cache.
pub async fn remove_invite_from_redis(
    redis: &Client,
    guild_id: GuildId,
    code: &str,
) -> Result<(), anyhow::Error> {
    let cache_key = keys::invites_key(guild_id);
    let inv_key = keys::inviters_key(guild_id);
    let max_uses_key = keys::invite_max_uses_key(guild_id);

    // Fetch who owned this invite before deleting it
    let inviter_id: Option<u64> = redis.hget(&inv_key, code).await.unwrap_or(None);

    let pipe = redis.pipeline();
    let _: () = pipe.hdel(&cache_key, code).await?;
    let _: () = pipe.hdel(&inv_key, code).await?;
    let _: () = pipe.hdel(&max_uses_key, code).await?;

    // A code that vanishes right after its last use is still the one that brought the member in.
    // Keep the inviter around briefly so the join can be attributed.
    if let Some(inviter_id) = inviter_id {
        let expired_key = keys::expired_inviters_key(guild_id);
        let _: () = pipe
            .hset(&expired_key, (code, expired_inviter_value(inviter_id)))
            .await?;
    }

    // Remove code from the user's active set
    if let Some(inviter_id) = inviter_id.map(UserId::from) {
        let _: () = pipe
            .srem(&keys::user_invites_key(guild_id, inviter_id), code)
            .await?;
    }

    let _: () = pipe.all().await?;
    prune_expired_inviters(redis, guild_id).await?;
    Ok(())
}

/// How long a vanished invite code stays attributable.
const EXPIRED_INVITER_TTL_SECS: i64 = 300;

/// Encodes an inviter id with the moment it was recorded.
fn expired_inviter_value(inviter_id: u64) -> String {
    let now = chrono::Utc::now().timestamp();
    format!("{inviter_id}:{now}")
}

/// Decodes an expired inviter entry, dropping it when it is past its window.
fn decode_expired_inviter(value: &str) -> Option<u64> {
    let (inviter_id, recorded_at) = value.split_once(':')?;
    let inviter_id = inviter_id.parse::<u64>().ok()?;
    let recorded_at = recorded_at.parse::<i64>().ok()?;
    let age = chrono::Utc::now().timestamp().saturating_sub(recorded_at);
    if age > EXPIRED_INVITER_TTL_SECS {
        return None;
    }
    Some(inviter_id)
}

/// Drops expired entries so the map does not grow without bound.
async fn prune_expired_inviters(redis: &Client, guild_id: GuildId) -> Result<(), anyhow::Error> {
    let expired_key = keys::expired_inviters_key(guild_id);
    let entries: HashMap<String, String> = redis.hgetall(&expired_key).await.unwrap_or_default();
    let stale: Vec<String> = entries
        .iter()
        .filter(|(_, value)| decode_expired_inviter(value).is_none())
        .map(|(code, _)| code.clone())
        .collect();

    if stale.is_empty() {
        return Ok(());
    }

    let _: () = redis.hdel(&expired_key, stale).await?;
    Ok(())
}

/// Fetches the cached invite use counts for a guild, defaulting to an empty map on error.
pub async fn get_invite_uses(redis: &Client, guild_id: GuildId) -> HashMap<String, u64> {
    redis
        .hgetall(&keys::invites_key(guild_id))
        .await
        .unwrap_or_default()
}

/// Fetches the cached maximum use count per invite code.
pub async fn get_invite_max_uses(redis: &Client, guild_id: GuildId) -> HashMap<String, u64> {
    redis
        .hgetall(&keys::invite_max_uses_key(guild_id))
        .await
        .unwrap_or_default()
}

/// Replaces the cached use counts for a guild, dropping codes that are no longer active.
///
/// Codes that vanished are removed so a later join cannot mistake an exhausted invite for a
/// newly missing one.
pub async fn sync_cached_invite_uses(
    redis: &Client,
    guild_id: GuildId,
    uses_items: Vec<(&str, u64)>,
    max_uses_items: Vec<(&str, u64)>,
) -> Result<(), anyhow::Error> {
    let cache_key = keys::invites_key(guild_id);
    let max_uses_key = keys::invite_max_uses_key(guild_id);

    let current: HashSet<&str> = uses_items.iter().map(|(code, _)| *code).collect();
    let stale: Vec<String> = redis
        .hkeys::<Vec<String>, _>(&cache_key)
        .await
        .unwrap_or_default()
        .into_iter()
        .filter(|code| !current.contains(code.as_str()))
        .collect();

    let pipe = redis.pipeline();
    for code in &stale {
        let _: () = pipe.hdel(&cache_key, code).await?;
        let _: () = pipe.hdel(&max_uses_key, code).await?;
    }
    if !uses_items.is_empty() {
        let _: () = pipe.hset(&cache_key, uses_items).await?;
    }
    if !max_uses_items.is_empty() {
        let _: () = pipe.hset(&max_uses_key, max_uses_items).await?;
    }
    let _: () = pipe.all().await?;

    Ok(())
}

/// Fetches the cached inviter for an invite code, if any.
///
/// Codes that vanished after their last use are looked up in the expired map, since Discord
/// removes the invite before the join is handled.
pub async fn get_cached_inviter(redis: &Client, guild_id: GuildId, code: &str) -> Option<u64> {
    if let Some(inviter) = redis
        .hget(&keys::inviters_key(guild_id), code)
        .await
        .unwrap_or(None)
    {
        return Some(inviter);
    }

    let expired: Option<String> = redis
        .hget(&keys::expired_inviters_key(guild_id), code)
        .await
        .unwrap_or(None);

    expired.and_then(|value| decode_expired_inviter(&value))
}

/// Stores the inviter attribution and updated invite count for a member join.
pub async fn store_invite_attribution(
    redis: &Client,
    guild_id: GuildId,
    member_id: u64,
    inviter_id: u64,
    new_count: u64,
) -> Result<(), anyhow::Error> {
    let pipe = redis.pipeline();
    let _: () = pipe
        .hset(&keys::invited_by_key(guild_id), (member_id, inviter_id))
        .await?;
    let _: () = pipe
        .hset(
            &keys::inviter_counts_key(guild_id),
            (inviter_id.to_string(), new_count),
        )
        .await?;
    let _: () = pipe.all().await?;
    Ok(())
}
