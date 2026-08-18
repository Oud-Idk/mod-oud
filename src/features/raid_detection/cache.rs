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
use serenity::all::{GuildId, UserId};

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
