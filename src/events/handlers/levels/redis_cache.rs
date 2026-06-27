use crate::events::handlers::levels::database;
use crate::events::handlers::levels::levels_text::XpMultiplier;
use crate::types::config::leveling::LevelingConfig;
use crate::types::Error;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serenity::all::GuildId;
use sqlx::PgPool;
use tracing::{debug, error, instrument, warn};

#[instrument(skip(redis, db), fields(guild_id = %guild_id.get()))]
pub async fn cache_aside_multipliers(
    redis: &mut MultiplexedConnection,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: &GuildId,
) -> Result<Vec<XpMultiplier>, Error> {
    debug!(key = %multiplier_key, "Checking Redis cache for multipliers");
    let cached_multipliers: Option<String> = redis.get(&multiplier_key).await.ok();

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
            let _: () = redis.set_ex(&multiplier_key, serialized, 3600).await?;

            db_multipliers
        }
    };

    Ok(multipliers)
}

#[instrument(skip(redis, config))]
pub async fn create_redis_cooldown(
    cooldown_key: &str,
    config: &LevelingConfig,
    redis: &MultiplexedConnection,
) -> Result<bool, redis::RedisError> {
    let mut redis_conn = redis.clone();
    let cooldown_duration = config.text.xp_cooldown;

    debug!(
        key = %cooldown_key,
        duration = cooldown_duration,
        "Attempting to set cooldown in Redis"
    );

    let cooldown: Result<bool, redis::RedisError> = redis::cmd("SET")
        .arg(&cooldown_key)
        .arg(1)
        .arg("NX")
        .arg("EX")
        .arg(cooldown_duration)
        .query_async(&mut redis_conn)
        .await;

    match &cooldown {
        Ok(true) => debug!(key = %cooldown_key, "Cooldown successfully created"),
        Ok(false) => debug!(key = %cooldown_key, "Cooldown already active"),
        Err(err) => error!(error = ?err, key = %cooldown_key, "Failed to execute Redis cooldown command"),
    }

    cooldown
}