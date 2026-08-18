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
use std::collections::HashMap;

use crate::features::invite_tracking::keys;

pub struct CachePairs<'a> {
    pub uses_items: Vec<(&'a str, u64)>,
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
    let mut inviter_items = Vec::with_capacity(len);
    let mut codes_by_user: HashMap<UserId, Vec<&'a str>> = HashMap::new();

    for inv in invites {
        let code = inv.code.as_str();
        uses_items.push((code, inv.uses));

        if let Some(u) = &inv.inviter {
            let user_id = u.id;
            // Using raw u64 `.get()` to avoid making looping on the Redis request
            inviter_items.push((code, user_id.get()));
            codes_by_user.entry(user_id).or_default().push(code);
        }
    }

    CachePairs {
        uses_items,
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
    let pipe = redis.pipeline();
    let _: () = pipe
        .hset(&cache_key, (invite_data.code.as_str(), invite_data.uses))
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

    let pipe = redis.pipeline();
    let _: () = pipe.del(&cache_key).await?;
    let _: () = pipe.del(&inv_key).await?;

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
