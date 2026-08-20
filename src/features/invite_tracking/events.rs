use crate::core::config::settings::GuildSettings;
use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::invite_tracking::cache::{
    collect_pairs, get_cached_inviter, get_invite_uses, remove_invite_from_redis,
    replace_guild_invites, store_invite_attribution, store_invite_to_redis_hash,
    update_cached_invite_uses,
};
use crate::features::invite_tracking::database::attribute_join;
use crate::shared::store_username_relation;
use anyhow::Context as _;
use fred::clients::Client;
use moka::future::Cache;
use serenity::all::{Context, Guild, GuildId, InviteCreateEvent, InviteDeleteEvent, Member};
use sqlx::PgPool;
use std::collections::HashSet;
use tracing::{debug, warn};

/// Refreshes the cached invite codes and inviters for a guild in Redis.
///
/// # Errors
/// Returns [`Err`] if any step of the Redis pipeline fails.
pub async fn fetch_current_invites(
    ctx: &Context,
    guild: &Guild,
    data: &BotData,
) -> Result<(), Error> {
    let core = &data.core;

    if !check_if_enabled(&core.redis, &core.db, &core.guild_configs_cache, guild.id).await? {
        return Ok(());
    }

    let invites = guild.invites(&ctx).await?;

    for invite in &invites {
        if let Some(inviter) = &invite.inviter {
            store_username_relation(&core.username_tx, inviter.id, &inviter.name).await?;
        }
    }

    let cache_pairs = collect_pairs(&invites);
    replace_guild_invites(&core.redis, guild.id, cache_pairs).await?;

    Ok(())
}

/// Stores a newly created invite code in the Redis cache.
///
/// # Errors
/// Returns [`Err`] if any step of the Redis pipeline fails.
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

    store_invite_to_redis_hash(guild_id, redis, invite_data).await?;
    Ok(())
}

/// Removes a deleted invite code from the Redis cache.
///
/// # Errors
/// Returns [`Err`] if any step of the Redis pipeline fails.
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

    remove_invite_from_redis(redis, guild_id, &invite_data.code).await?;
    Ok(())
}

/// Checks whether invite tracking is enabled for the given guild.
///
/// # Errors
/// Returns [`Err`] if getting settings failed
pub async fn check_if_enabled(
    redis: &Client,
    db: &PgPool,
    cache: &Cache<GuildId, GuildSettings>,
    guild_id: GuildId,
) -> Result<bool, Error> {
    get_settings(db, redis, cache, guild_id)
        .await
        .map(|s| s.invite_tracker.and_then(|s| s.enabled).unwrap_or(false))
        .context("Failed to get settings to check whether invite tracking is enabled")
}

/// Attributes a member join to the inviter whose invite use count incremented.
///
/// # Errors
/// Returns [`Err`] if any step of the Redis pipeline fails.
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

    let old_uses = get_invite_uses(redis, guild_id).await;

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
    let cache_pairs = collect_pairs(&current_invites);
    if !cache_pairs.uses_items.is_empty() {
        update_cached_invite_uses(redis, guild_id, cache_pairs.uses_items).await?;
    }

    let Some(code) = used_code else {
        debug!(
            %guild_id,
            member_id = new_member.user.id.get(),
            "Could not determine which invite was used (vanity URL, oauth join, or bot invite?)"
        );
        return Ok(());
    };

    let Some(inviter_id) = get_cached_inviter(redis, guild_id, &code).await else {
        debug!(%guild_id, %code, "No cached inviter for this code");
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

    store_invite_attribution(
        redis,
        guild_id,
        new_member.user.id.get(),
        inviter_id,
        new_count,
    )
    .await?;

    debug!(%guild_id, member_id = %new_member.user.id, inviter_id, %code, "Attributed join to inviter");
    Ok(())
}
