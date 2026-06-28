use crate::events::handlers::levels::database;
use crate::types::config::leveling::LevelingConfig;
use crate::types::leveling::{UserLevel, XpMultiplier};
use crate::types::Error;
use fred::clients::Client;
use fred::interfaces::{FredResult, HashesInterface, KeysInterface, SetsInterface, TransactionInterface};
use fred::prelude::Expiration;
use fred::types::SetOptions;
use serenity::all::GuildId;
use sqlx::PgPool;
use tracing::{debug, error, instrument, warn};

#[instrument(skip(redis, db), fields(guild_id = %guild_id.get()))]
pub async fn cache_aside_multipliers(
    redis: &Client,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: &GuildId,
) -> Result<Vec<XpMultiplier>, Error> {
    debug!(key = %multiplier_key, "Checking Redis cache for multipliers");
    let cached_multipliers: Option<String> = redis.get(multiplier_key).await.ok();

    let multipliers = match cached_multipliers {
        Some(json_data) => {
            debug!(key = %multiplier_key, "Cache hit for multipliers");
            serde_json::from_str(&json_data).unwrap_or_else(|err| {
                warn!(
                    error = ?err,
                    key = %multiplier_key,
                    "Failed to deserialize cached multipliers; falling back to empty list"
                );
                Vec::new()
            })
        }
        None => {
            debug!(key = %multiplier_key, "Cache miss; fetching multipliers from database");
            let db_multipliers = database::get_multipliers(db, &guild_id.get().to_string()).await?;

            debug!(key = %multiplier_key, "Serializing and caching multipliers in Redis");
            let serialized = serde_json::to_string(&db_multipliers)?;
            let _: () = redis.set(multiplier_key, serialized, Some(Expiration::EX(3600)), None, false).await?;

            db_multipliers
        }
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

    let cooldown = redis
        .set(
            cooldown_key,
            1,
            Some(Expiration::EX(cooldown_duration as i64)),
            Some(SetOptions::NX),
            false,
        )
        .await;

    match &cooldown {
        Ok(true) => debug!(key = %cooldown_key, "Cooldown successfully created"),
        Ok(false) => debug!(key = %cooldown_key, "Cooldown already active"),
        Err(err) => error!(error = ?err, key = %cooldown_key, "Failed to execute Redis cooldown command"),
    }

    cooldown
}

/// Uses Fred's pipelining/transaction feature to write levels atomically.
pub async fn save_leveling_cache(
    redis: &Client,
    stats_key: &str,
    user_level: &UserLevel,
    guild_id_str: &str,
    user_field: &str,
) -> Result<(), Error> {
    let serialized = serde_json::to_string(user_level)?;
    let guild_pending_key = format!("levels:pending:{}", guild_id_str);

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