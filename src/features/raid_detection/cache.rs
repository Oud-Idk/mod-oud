use crate::core::config::state::Error;
use crate::features::raid_detection::constants::{
    CACHE_STATS_TTL_SECONDS, HASH_TTL_DAYS, HISTORY_HOURS,
};
use crate::features::raid_detection::keys;
use crate::features::raid_detection::types::Stats;
use chrono::{DateTime, Duration, Utc};
use fred::clients::Client;
use fred::interfaces::{
    FredResult, HashesInterface, KeysInterface, SetsInterface, SortedSetsInterface,
};
use fred::prelude::Expiration;
use fred::types::SetOptions;
use serenity::all::{GuildId, UserId};
use std::collections::HashMap;
use tracing::info;

#[allow(clippy::cast_precision_loss)]
pub async fn record_join_event(
    redis: &Client,
    window_size_seconds: i64,
    guild_id: GuildId,
    user_id: UserId,
    now_ts: i64,
    hour_str: &str,
) -> Result<i64, Error> {
    let joins_key = keys::recent_join_hash_key(guild_id);
    let stats_key = keys::hourly_stats_hash_key(guild_id);
    let member_key = keys::member_key(user_id, now_ts);
    // Use exclusive cutoff "(" so joins at exact cutoff timestamp are not prematurely deleted
    let cutoff = format!("({}", now_ts - window_size_seconds);

    let pipeline = redis.pipeline();

    let _: () = pipeline
        .zadd(
            &joins_key,
            None,
            None,
            false,
            false,
            (now_ts as f64, &member_key),
        )
        .await?;
    let _: () = pipeline
        .zremrangebyscore(&joins_key, "-inf", cutoff)
        .await?;
    let _: () = pipeline.zcard(&joins_key).await?;
    let _: () = pipeline
        .expire(&joins_key, window_size_seconds * 2, None)
        .await?;
    let _: () = pipeline.hincrby(&stats_key, hour_str, 1).await?;
    let _: () = pipeline
        .expire(&stats_key, HASH_TTL_DAYS * 86400, None)
        .await?;

    let ((), _, current_joins_in_window, _, _, _): ((), i64, i64, bool, i64, bool) =
        pipeline.all().await?;

    Ok(current_joins_in_window)
}

pub async fn get_threshold(redis: &Client, stats_cache_key: &str) -> Result<Option<Stats>, Error> {
    if let Ok(Some(cached_json)) = redis.get::<Option<String>, _>(stats_cache_key).await
        && let Ok(stats) = serde_json::from_str::<Stats>(&cached_json)
    {
        return Ok(Some(stats));
    }

    Ok(None)
}

#[allow(clippy::cast_precision_loss)]
pub async fn get_history_from_cache(
    redis: &Client,
    now: DateTime<Utc>,
    hash_key: &str,
) -> Result<Vec<f64>, Error> {
    let fields: Vec<String> = (1..=HISTORY_HOURS)
        .map(|i| (now - Duration::hours(i)).format("%Y%m%d%H").to_string())
        .collect();

    let raw_history: Vec<Option<i64>> = redis.hmget(hash_key, fields).await?;
    let history: Vec<f64> = raw_history
        .into_iter()
        .map(|v| v.unwrap_or(0) as f64)
        .collect();
    Ok(history)
}

pub async fn cache_calculated_stats(
    redis: &Client,
    now: DateTime<Utc>,
    stats_cache_key: &str,
    hash_key: &str,
    stats: &Stats,
) -> Result<(), Error> {
    // Cache calculated stats
    let json_str = serde_json::to_string(&stats)?;
    let old_field = (now - Duration::hours(HISTORY_HOURS + 1))
        .format("%Y%m%d%H")
        .to_string();

    let _: () = redis
        .set(
            stats_cache_key,
            json_str,
            Some(Expiration::EX(CACHE_STATS_TTL_SECONDS)),
            None,
            false,
        )
        .await?;

    let _ = redis.hdel::<i64, _, _>(hash_key, old_field).await;
    Ok(())
}

pub async fn add_guild_to_raid(guild_id: GuildId, redis: &Client) -> FredResult<()> {
    redis.sadd(keys::active_raids_key(), guild_id.get()).await
}

pub async fn remove_guild_from_raid(guild_id: GuildId, redis: &Client) -> FredResult<()> {
    redis.srem(keys::active_raids_key(), guild_id.get()).await
}

pub async fn try_set_raid_active(
    redis: &Client,
    guild_id: GuildId,
    ttl_seconds: i64,
) -> Result<bool, Error> {
    let active_key = keys::raid_active_key(guild_id);

    let res: Option<String> = redis
        .set(
            active_key,
            "1",
            Some(Expiration::EX(ttl_seconds)),
            Some(SetOptions::NX),
            false,
        )
        .await?;

    Ok(res.is_some())
}

pub async fn extend_raid_active(
    redis: &Client,
    guild_id: GuildId,
    ttl_seconds: i64,
) -> Result<(), Error> {
    let active_key = keys::raid_active_key(guild_id);
    let _: () = redis.expire(active_key, ttl_seconds, None).await?;
    Ok(())
}

pub async fn clear_raid_active(redis: &Client, guild_id: GuildId) -> Result<(), Error> {
    let active_key = keys::raid_active_key(guild_id);
    let _: () = redis.del(active_key).await?;
    info!(%guild_id, "Cleared raid active state");
    Ok(())
}

pub async fn check_raid_active(redis: &Client, guild_id: GuildId) -> Result<bool, Error> {
    let active_key = keys::raid_active_key(guild_id);
    Ok(redis.exists(&active_key).await?)
}

pub async fn has_raid_snapshot(redis: &Client, guild_id: GuildId) -> Result<bool, Error> {
    let snapshot_key = keys::raid_snapshot_key(guild_id);
    Ok(redis.exists(&snapshot_key).await?)
}

pub async fn get_active_raids(redis: &Client) -> Result<Vec<GuildId>, Error> {
    let tracked_guilds: Vec<GuildId> = redis
        .smembers::<Vec<u64>, _>(keys::active_raids_key())
        .await?
        .into_iter()
        .map(GuildId::new)
        .collect();
    Ok(tracked_guilds)
}

pub async fn save_preraid_snapshot(
    redis: &Client,
    guild_id: GuildId,
    serialized: &str,
) -> Result<bool, Error> {
    let redis_key = keys::raid_snapshot_key(guild_id);
    let res: Option<String> = redis
        .set(
            redis_key,
            serialized,
            Some(Expiration::EX(86400)),
            Some(SetOptions::NX),
            false,
        )
        .await?;
    Ok(res.is_some())
}

pub async fn getdel_preraid_snapshot(
    redis: &Client,
    guild_id: GuildId,
) -> Result<Option<String>, Error> {
    let redis_key = keys::raid_snapshot_key(guild_id);
    Ok(redis.getdel(&redis_key).await?)
}

// ── Hourly stats accumulator ─────────────────────────────────────────

pub async fn increment_hourly_accumulator(
    redis: &Client,
    guild_id: GuildId,
    hour_str: &str,
) -> Result<(), Error> {
    let accum_key = keys::hourly_accumulator_key(guild_id);
    let dirty_key = keys::dirty_raid_guilds_key();

    let _: () = redis.hincrby(&accum_key, hour_str, 1).await?;
    let _: () = redis
        .expire(&accum_key, HASH_TTL_DAYS * 86400, None)
        .await?;
    let _: i64 = redis.sadd(dirty_key, guild_id.get()).await?;

    Ok(())
}

pub async fn claim_accumulator(
    redis: &Client,
    guild_id: GuildId,
) -> Result<HashMap<String, i64>, Error> {
    let accum_key = keys::hourly_accumulator_key(guild_id);

    let records: HashMap<String, String> = redis.hgetall(&accum_key).await?;

    let parsed: HashMap<String, i64> = records
        .into_iter()
        .filter_map(|(k, v)| v.parse::<i64>().ok().map(|n| (k, n)))
        .collect();

    if !parsed.is_empty() {
        let _: () = redis.del(&accum_key).await?;
    }

    Ok(parsed)
}

pub async fn remove_dirty_raid_guild(redis: &Client, guild_id: GuildId) -> Result<(), Error> {
    let dirty_key = keys::dirty_raid_guilds_key();
    let _: () = redis.srem(dirty_key, guild_id.get()).await?;
    Ok(())
}

pub async fn get_dirty_raid_guilds(redis: &Client) -> Result<Vec<GuildId>, Error> {
    let dirty_key = keys::dirty_raid_guilds_key();
    let guilds: Vec<GuildId> = redis
        .smembers::<Vec<u64>, _>(dirty_key)
        .await?
        .into_iter()
        .map(GuildId::new)
        .collect();
    Ok(guilds)
}
