use crate::events::handlers::levels::database;
use crate::events::handlers::levels::levels_text::XpMultiplier;
use crate::types::config::leveling::LevelingConfig;
use crate::types::Error;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serenity::all::GuildId;
use sqlx::PgPool;

pub async fn cache_aside_multipliers(redis: &mut MultiplexedConnection, multiplier_key: &str, db: &PgPool, guild_id: &GuildId) -> Result<Vec<XpMultiplier>, Error> {
    let cached_multipliers: Option<String> = redis.get(&multiplier_key).await.ok();

    let multipliers = match cached_multipliers {
        Some(json_data) => serde_json::from_str(&json_data).unwrap_or_default(),
        None => {
            let db_multipliers = database::get_multipliers(db, &guild_id.get().to_string()).await?;
            let serialized = serde_json::to_string(&db_multipliers)?;
            let _: () = redis.set_ex(&multiplier_key, serialized, 3600).await?;
            db_multipliers
        }
    };

    Ok(multipliers)
}

pub async fn create_redis_cooldown(cooldown_key: &str, config: &LevelingConfig, redis: &MultiplexedConnection) -> Result<bool, redis::RedisError> {
    let mut redis_conn = redis.clone();

    let cooldown: Result<bool, redis::RedisError> = redis::cmd("SET")
        .arg(&cooldown_key)
        .arg(1)
        .arg("NX")
        .arg("EX")
        .arg(config.text.xp_cooldown)
        .query_async(&mut redis_conn)
        .await;

    cooldown
}