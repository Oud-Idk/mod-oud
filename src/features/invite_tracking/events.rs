use crate::core::config::settings::GuildSettings;
use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features;
use crate::features::invite_tracking::cache::collect_pairs;
use crate::features::invite_tracking::database::attribute_join;
use crate::features::invite_tracking::keys;
use crate::shared::store_username_relation;
use fred::clients::Client;
use fred::interfaces::{HashesInterface, KeysInterface, SetsInterface};
use moka::future::Cache;
use serenity::all::{Context, Guild, GuildId, InviteCreateEvent, InviteDeleteEvent, Member};
use sqlx::PgPool;
use std::collections::HashMap;
use std::collections::HashSet;
use tracing::{debug, warn};

/// Refreshes the cached invite codes and inviters for a guild in Redis.
pub async fn fetch_current_invites(
    ctx: &Context,
    guild: &Guild,
    data: &BotData,
) -> Result<(), Error> {
    let redis = &data.core.redis;
    let db = &data.core.db;
    let cache = &data.core.guild_configs_cache;

    if !check_if_enabled(redis, db, cache, guild.id).await? {
        return Ok(());
    }

    let invites = guild.invites(&ctx).await?;

    for invite in &invites {
        if let Some(inviter) = &invite.inviter {
            store_username_relation(&data.core.username_tx, inviter.id.get(), &inviter.name)
                .await?;
        }
    }

    let cache_key = keys::invites_key(guild.id);
    let inv_key = keys::inviters_key(guild.id);

    let pipe = redis.pipeline();
    let _: () = pipe.del(&cache_key).await?;
    let _: () = pipe.del(&inv_key).await?;

    if invites.is_empty() {
        let _: () = pipe.all().await?;
        return Ok(());
    }

    let (uses_items, inviter_items, codes_by_user) = collect_pairs(&invites);

    // Save active codes into per-user sets
    for (user_id, codes) in codes_by_user {
        let user_key = keys::user_invites_key(guild.id, user_id);
        let _: () = pipe.del(&user_key).await?;
        let _: () = pipe.sadd(&user_key, codes).await?;
    }

    let _: () = pipe.hset(&cache_key, uses_items).await?;
    let _: () = pipe.hset(&inv_key, inviter_items).await?;
    let _: () = pipe.all().await?;

    Ok(())
}

/// Stores a newly created invite code in the Redis cache.
pub async fn store_invite(
    _: &Context,
    invite_data: &InviteCreateEvent,
    data: &BotData,
) -> Result<(), Error> {
    let Some(guild_id) = invite_data.guild_id else {
        return Ok(());
    };
    let redis = &data.core.redis;
    let db = &data.core.db;
    let cache = &data.core.guild_configs_cache;

    if !check_if_enabled(redis, db, cache, guild_id).await? {
        return Ok(());
    }

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
                &keys::user_invites_key(guild_id, inviter.id.get()),
                invite_data.code.as_str(),
            )
            .await?;
    }

    let _: () = pipe.all().await?;
    Ok(())
}

/// Removes a deleted invite code from the Redis cache.
pub async fn delete_invite(
    _: &Context,
    invite_data: &InviteDeleteEvent,
    data: &BotData,
) -> Result<(), Error> {
    let Some(guild_id) = invite_data.guild_id else {
        return Ok(());
    };
    let redis = &data.core.redis;
    let db = &data.core.db;
    let cache = &data.core.guild_configs_cache;

    if !check_if_enabled(redis, db, cache, guild_id).await? {
        return Ok(());
    }

    let cache_key = keys::invites_key(guild_id);
    let inv_key = keys::inviters_key(guild_id);

    // Fetch who owned this invite before deleting it
    let inviter_id: Option<u64> = redis
        .hget(&inv_key, invite_data.code.as_str())
        .await
        .unwrap_or(None);

    let pipe = redis.pipeline();
    let _: () = pipe.hdel(&cache_key, invite_data.code.as_str()).await?;
    let _: () = pipe.hdel(&inv_key, invite_data.code.as_str()).await?;

    // Remove code from the user's active set
    if let Some(uid) = inviter_id {
        let _: () = pipe
            .srem(
                &keys::user_invites_key(guild_id, uid),
                invite_data.code.as_str(),
            )
            .await?;
    }

    let _: () = pipe.all().await?;
    Ok(())
}

/// Checks whether invite tracking is enabled for the given guild.
pub async fn check_if_enabled(
    redis: &Client,
    db: &PgPool,
    cache: &Cache<u64, GuildSettings>,
    guild_id: GuildId,
) -> Result<bool, Error> {
    Ok(get_settings(db, redis, cache, guild_id.get())
        .await?
        .invite_tracker
        .and_then(|s| s.enabled)
        .unwrap_or(false))
}

/// Attributes a member join to the inviter whose invite use count incremented.
pub async fn store_member_invite(
    ctx: &Context,
    new_member: &Member,
    data: &BotData,
) -> Result<(), Error> {
    let guild_id = new_member.guild_id;
    let redis = &data.core.redis;
    let db = &data.core.db;
    let cache = &data.core.guild_configs_cache;

    if !check_if_enabled(redis, db, cache, guild_id).await? {
        return Ok(());
    }

    let current_invites = guild_id.invites(&ctx.http).await.inspect_err(|err| {
        warn!("Failed to fetch invites for guild {}: {:?}", guild_id, err);
    })?;

    let cache_key = keys::invites_key(guild_id);
    let inv_key = keys::inviters_key(guild_id);

    let old_uses: HashMap<String, u64> = redis.hgetall(&cache_key).await.unwrap_or_default();

    // Find invite whose use count incremented
    let mut used_code = current_invites.iter().find_map(|inv| {
        let prev = old_uses.get(inv.code.as_str()).copied().unwrap_or(0);
        (inv.uses > prev).then(|| inv.code.clone())
    });

    // Check if an invite completely disappeared (e.g. single-use/max-uses reached)
    if used_code.is_none() {
        let current_codes: HashSet<&str> = current_invites
            .iter()
            .map(|inv| inv.code.as_str())
            .collect();
        let missing_codes: Vec<&String> = old_uses
            .keys()
            .filter(|code| !current_codes.contains(code.as_str()))
            .collect();

        // If exactly 1 invite disappeared at the moment of join, it was the single-use invite
        if missing_codes.len() == 1 {
            used_code = Some(missing_codes[0].clone());
        }
    }

    // Refresh uses cache with current state
    let (uses_items, _, _) = collect_pairs(&current_invites);
    if !uses_items.is_empty() {
        let _: () = redis.hset(&cache_key, uses_items).await?;
    }

    let Some(code) = used_code else {
        debug!(
            guild_id = guild_id.get(),
            member_id = new_member.user.id.get(),
            "Could not determine which invite was used (vanity URL, oauth join, or bot invite?)"
        );
        return Ok(());
    };

    let inviter_id: Option<u64> = redis.hget(&inv_key, &code).await.unwrap_or(None);
    let Some(inviter_id) = inviter_id else {
        debug!(guild_id = guild_id.get(), %code, "No cached inviter for this code");
        return Ok(());
    };

    let new_count = attribute_join(
        db,
        guild_id.get(),
        new_member.user.id.get(),
        inviter_id,
        &code,
    )
    .await?;

    let pipe = redis.pipeline();
    let _: () = pipe
        .hset(
            &keys::invited_by_key(guild_id),
            (new_member.user.id.get(), inviter_id),
        )
        .await?;
    let _: () = pipe
        .hset(
            &keys::inviter_counts_key(guild_id),
            (inviter_id.to_string(), new_count),
        )
        .await?;
    let _: () = pipe.all().await?;

    debug!(guild_id = guild_id.get(), member_id = new_member.user.id.get(), inviter_id, %code, "Attributed join to inviter");
    Ok(())
}
