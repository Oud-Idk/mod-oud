use crate::features::leveling;
use crate::features::leveling::types::VcSession;
use crate::features::leveling::types::{LevelingConfig, UserLevel, XpMultiplier};
use crate::features::leveling::{database, keys};
use anyhow::Result;
use fred::clients::Client;
use fred::interfaces::{FredResult, HashesInterface, KeysInterface, SetsInterface, TransactionInterface};
use fred::prelude::Expiration;
use fred::types::SetOptions;
use serenity::all::{ChannelId, GuildId, UserId};
use sqlx::PgPool;
use tracing::{debug, instrument, trace, warn};

#[instrument(skip(redis, db), fields(%guild_id))]
pub async fn cache_aside_multipliers(
    redis: &Client,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: GuildId,
) -> Result<Vec<XpMultiplier>> {
    debug!(key = %multiplier_key, "Checking Redis cache for multipliers");
    let cached_multipliers: Option<String> = redis.get(multiplier_key).await.ok();

    let multipliers = if let Some(json_data) = cached_multipliers {
        debug!(key = %multiplier_key, "Cache hit for multipliers");
        serde_json::from_str(&json_data).unwrap_or_else(|err| {
            warn!(
                error = ?err,
                key = %multiplier_key,
                "Failed to deserialize cached multipliers; falling back to empty list"
            );
            Vec::new()
        })
    } else {
        debug!(key = %multiplier_key, "Cache miss; fetching multipliers from database");
        let db_multipliers = database::get_multipliers(db, guild_id.get()).await?;

        debug!(key = %multiplier_key, "Serializing and caching multipliers in Redis");
        let serialized = serde_json::to_string(&db_multipliers)?;
        let _: () = redis.set(multiplier_key, serialized, Some(Expiration::EX(3600)), None, false).await?;

        db_multipliers
    };

    Ok(multipliers)
}

#[instrument(skip(redis, config))]
pub async fn create_redis_cooldown(
    cooldown_key: &str,
    config: &LevelingConfig,
    redis: &Client,
) -> FredResult<bool> {
    let cooldown_duration = config.text.xp_cooldown;

    debug!(
        key = %cooldown_key,
        duration = cooldown_duration,
        "Attempting to set cooldown in Redis"
    );

    let cooldown_result: Option<String> = redis
        .set(
            cooldown_key,
            1,
            Some(Expiration::EX(i64::from(cooldown_duration))),
            Some(SetOptions::NX),
            false,
        )
        .await?;

    let success = cooldown_result.is_some();

    if success {
        debug!(key = %cooldown_key, "Cooldown successfully created");
    } else {
        debug!(key = %cooldown_key, "Cooldown already active");
    }

    Ok(success)
}

/// Uses Fred's pipelining/transaction feature to write levels atomically.
pub async fn save_leveling_cache(
    redis: &Client,
    stats_key: &str,
    user_level: &UserLevel,
    guild_id_str: &str,
    user_field: &str,
) -> Result<()> {
    let serialized = serde_json::to_string(user_level)?;
    let guild_pending_key = format!("levels:pending:{guild_id_str}");

    let trx = redis.multi();

    let _: () = trx.set(stats_key, &serialized, Some(Expiration::EX(3600)), None, false).await?;
    let _: () = trx.hset(&guild_pending_key, (user_field, &serialized)).await?;
    let _: () = trx.sadd("levels:dirty_guilds", guild_id_str).await?;
    let _: () = trx.exec(false).await?;

    Ok(())
}

pub async fn save_user_level_cache(redis: &Client, stats_key: &str, serialized: String) -> FredResult<()> {
    redis.set(stats_key, serialized, Some(Expiration::EX(3600)), None, false).await
}

/// Adds a user to a channel's eligible-occupant set.
/// Returns (`count_after`, `was_newly_added`).
pub async fn add_occupant(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    user_id: UserId,
) -> Result<(i64, bool)> {
    let key = keys::occupants_key(guild_id, channel_id);
    let added: i64 = redis.sadd(&key, user_id.get().to_string()).await?;
    let _: Result<(), _> = redis.expire(&key, 86400, None).await;
    let count: i64 = redis.scard(&key).await?;
    Ok((count, added == 1))
}

/// Removes a user from a channel's eligible-occupant set. Returns the count after removal.
pub async fn remove_occupant(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    user_id: UserId,
) -> Result<i64> {
    let key = keys::occupants_key(guild_id, channel_id);
    let _: () = redis.srem(&key, user_id.get().to_string()).await?;
    let count: i64 = redis.scard(&key).await?;
    Ok(count)
}

async fn get_occupants(redis: &Client, guild_id: GuildId, channel_id: ChannelId) -> Result<Vec<u64>> {
    let key = keys::occupants_key(guild_id, channel_id);
    let members: Vec<String> = redis.smembers(&key).await?;
    Ok(members.into_iter().filter_map(|m| m.parse::<u64>().ok()).collect())
}

/// Resumes the accrual clock for every eligible occupant in a channel.
/// Call when the occupant count crosses from <2 up to >=2.
pub async fn resume_channel_clocks(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    now: i64,
) -> Result<()> {
    for uid in get_occupants(redis, guild_id, channel_id).await? {
        resume_clock(redis, guild_id, UserId::new(uid), now).await?;
    }
    Ok(())
}

/// Pauses the accrual clock for every remaining eligible occupant in a channel, banking elapsed time.
/// Call when the occupant count drops below 2.
pub async fn pause_channel_clocks(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    now: i64,
) -> Result<()> {
    for uid in get_occupants(redis, guild_id, channel_id).await? {
        pause_clock(redis, guild_id, UserId::new(uid), now).await?;
    }
    Ok(())
}

/// Opens a new voice session for a user who just became eligible (connected + not deafened).
/// `start_clock` should be true if the channel already has another eligible occupant.
pub async fn open_session(
    redis: &Client,
    guild_id: GuildId,
    user_id: UserId,
    channel_id: ChannelId,
    now: i64,
    start_clock: bool,
) -> Result<()> {
    let key = keys::session_key(guild_id, user_id);
    trace!(
        %guild_id,
        %user_id,
        %channel_id,
        start_clock,
        "Opening voice session"
    );

    let session = VcSession {
        join_time: now,
        channel_id,
        accumulated_secs: 0,
        clock_started_at: if start_clock { Some(now) } else { None },
    };
    set_session(redis, &key, &session).await
}

/// Resumes a paused clock (channel crossed from <2 to >=2 eligible occupants). No-op if already running
/// or if the user has no active session.
pub async fn resume_clock(
    redis: &Client,
    guild_id: GuildId,
    user_id: UserId,
    now: i64,
) -> Result<()> {
    let key = keys::session_key(guild_id, user_id);
    if let Some(mut s) = get_session(redis, &key).await?
        && s.clock_started_at.is_none() {
        trace!(%guild_id, user_id = user_id.get(), "Resuming voice XP clock");
        s.clock_started_at = Some(now);
        set_session(redis, &key, &s).await?;
    }
    Ok(())
}

/// Pauses a running clock (channel dropped below 2 eligible occupants), banking elapsed time.
/// No-op if already paused or if the user has no active session.
pub async fn pause_clock(
    redis: &Client,
    guild_id: GuildId,
    user_id: UserId,
    now: i64,
) -> Result<()> {
    let key = leveling::keys::session_key(guild_id, user_id);
    if let Some(mut s) = get_session(redis, &key).await?
        && let Some(started) = s.clock_started_at.take() {
        trace!(%guild_id, user_id = user_id.get(), "Pausing voice XP clock (alone in channel)");
        s.accumulated_secs += (now - started).max(0);
        set_session(redis, &key, &s).await?;
    }
    Ok(())
}

/// Deletes the user's active session from Redis, banks any remaining running clock time,
/// and returns the final calculated session details.
pub async fn consume_session(
    redis: &Client,
    session_key: &str,
    now: i64,
) -> Result<Option<VcSession>> {
    trace!("Consuming active voice session from Redis");

    let Some(mut s) = get_session(redis, session_key).await? else {
        return Ok(None);
    };

    // Bank any running clock time
    if let Some(started) = s.clock_started_at.take() {
        s.accumulated_secs += (now - started).max(0);
    }

    // Delete the session key from Redis
    let _: () = redis.del(session_key).await?;

    Ok(Some(s))
}

/// Peeks at a user's session without consuming it.
pub async fn get_session(redis: &Client, key: &str) -> Result<Option<VcSession>> {
    let cached: Option<String> = redis.get(key).await?;
    Ok(match cached {
        Some(s) => serde_json::from_str::<VcSession>(&s).ok(),
        None => None,
    })
}

async fn set_session(redis: &Client, key: &str, session: &VcSession) -> Result<()> {
    let serialized = serde_json::to_string(session)?;
    let _: () = redis
        .set(key, &serialized, Some(Expiration::EX(86400)), None, false)
        .await?;
    Ok(())
}