use crate::core::config::get_settings;
use crate::events::handlers::levels::cache;
use crate::types::config::leveling::LevelingConfig;
use crate::types::leveling::{LevelReward, UserLevel, XpMultiplier};
use crate::types::{Data, Error};
use fred::clients::Client;
use fred::interfaces::{KeysInterface, SetsInterface, TransactionInterface};
use serenity::all::{GuildId, UserId};
use sqlx::postgres::PgQueryResult;
use sqlx::PgPool;
use tracing::trace;

pub async fn get_level(db: &PgPool, guild_id: GuildId, user_id: UserId) -> Result<Option<UserLevel>, sqlx::Error> {
    sqlx::query_as!(
        UserLevel,
        "SELECT *
        FROM levels
        WHERE user_id = $1 AND guild_id = $2",
        user_id.to_string(),
        guild_id.to_string(),
    ).fetch_optional(db).await
}

pub async fn insert_level(db: &PgPool, guild_id: GuildId, user_id: UserId, username: &str) -> Result<UserLevel, sqlx::Error> {
    sqlx::query_as!(
        UserLevel,
        "INSERT INTO levels (user_id, guild_id, username)
         VALUES ($1, $2, $3)
         RETURNING *",
        user_id.to_string(),
        guild_id.to_string(),
        username,
    )
        .fetch_one(db)
        .await
}

pub async fn update_level(db: &PgPool, user_level: &UserLevel) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        "UPDATE levels
         SET cumulative_xp = $1, current_level = $2, current_xp = $3
         WHERE user_id = $4 AND guild_id = $5",
        user_level.cumulative_xp,
        user_level.current_level,
        user_level.current_xp,
        user_level.user_id,
        user_level.guild_id
    )
        .execute(db)
        .await
}

pub async fn get_multipliers(db: &PgPool, guild_id: &str) -> Result<Vec<XpMultiplier>, Error> {
    let multipliers = sqlx::query_as!(
        XpMultiplier,
        r#"
        SELECT target_id, target_type AS "target_type!", multiplier AS "multiplier!"
        FROM xp_multipliers
        WHERE guild_id = $1
        "#,
        guild_id
    )
        .fetch_all(db)
        .await?;

    Ok(multipliers)
}

/// Fetches all level rewards for a specific guild
pub async fn fetch_level_rewards(
    db: &PgPool,
    guild_id: &str,
) -> Result<Vec<LevelReward>, sqlx::Error> {
    sqlx::query_as!(
        LevelReward,
        r#"
        SELECT level_requirement, roles_to_add, remove_previous_roles
        FROM level_rewards
        WHERE guild_id = $1
        "#,
        guild_id
    )
        .fetch_all(db)
        .await
}

pub async fn get_user_level(redis: &Client, db: &PgPool, guild_id: &GuildId, author_id: &UserId, stats_key: &str, username: &str) -> Result<UserLevel, Error> {
    let cached_user: Option<String> = redis.get(stats_key).await?;

    match cached_user {
        Some(json_data) => {
            Ok(serde_json::from_str::<UserLevel>(&json_data)?)
        }
        None => {
            let db_user = get_level(db, *guild_id, *author_id).await?;

            let user = match db_user {
                Some(user) => user,
                None => {
                    insert_level(db, *guild_id, *author_id, username).await?
                }
            };

            let serialized = serde_json::to_string(&user)?;
            let _: () = cache::save_user_level_cache(redis, stats_key, serialized).await?;

            Ok(user)
        }
    }
}

pub async fn load_leveling_config(
    data: &Data,
    guild_id: GuildId,
) -> Result<Option<LevelingConfig>, Error> {
    let config = get_settings(&data.db, &data.redis, &data.guild_configs, guild_id.get() as i64)
        .await?;

    let Some(leveling_config) = config.leveling else {
        trace!(guild_id = guild_id.get(), "Skipping XP reward: leveling system is unconfigured");
        return Ok(None);
    };

    if !leveling_config.voice.enabled {
        trace!(guild_id = guild_id.get(), "Skipping XP reward: voice leveling is disabled");
        return Ok(None);
    }

    Ok(Some(leveling_config))
}