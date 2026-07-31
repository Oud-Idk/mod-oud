use crate::Data;
use crate::core::config::settings::get_settings;
use crate::features::leveling::cache;
use crate::features::leveling::types::{LevelReward, LevelingConfig, UserLevel, XpMultiplier};
use anyhow::Result;
use fred::clients::Client;
use fred::interfaces::{KeysInterface, SetsInterface, TransactionInterface};
use serenity::all::{GuildId, UserId};
use sqlx::PgPool;
use sqlx::postgres::PgQueryResult;
use std::result;
use tracing::trace;

pub async fn get_level(db: &PgPool, guild_id: GuildId, user_id: UserId) -> Result<Option<UserLevel>> {
    Ok(sqlx::query_as!(
        UserLevel,
        "SELECT *
        FROM levels
        WHERE user_id = $1 AND guild_id = $2",
        user_id.get() as i64,
        guild_id.get() as i64,
    ).fetch_optional(db).await?)
}

pub async fn insert_level(db: &PgPool, guild_id: GuildId, user_id: UserId) -> Result<UserLevel> {
    Ok(sqlx::query_as!(
        UserLevel,
        "INSERT INTO levels (user_id, guild_id)
         VALUES ($1, $2)
         RETURNING *",
        user_id.get() as i64,
        guild_id.get() as i64,
    )
        .fetch_one(db)
        .await?)
}

pub async fn update_level(db: &PgPool, user_level: &UserLevel) -> Result<PgQueryResult> {
    Ok(sqlx::query!(
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
        .await?)
}

pub async fn get_multipliers(db: &PgPool, guild_id: i64) -> Result<Vec<XpMultiplier>> {
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
    guild_id: i64,
) -> Result<Vec<LevelReward>> {
    Ok(sqlx::query_as!(
        LevelReward,
        r#"
        SELECT level_requirement, roles_to_add, remove_previous_roles
        FROM level_rewards
        WHERE guild_id = $1
        "#,
        guild_id
    )
        .fetch_all(db)
        .await?)
}

pub async fn get_user_level(redis: &Client, db: &PgPool, guild_id: &GuildId, author_id: &UserId, stats_key: &str, username: &str) -> Result<UserLevel> {
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
                    insert_level(db, *guild_id, *author_id).await?
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
) -> Result<Option<LevelingConfig>> {
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

pub async fn upsert_level(
    db: &PgPool,
    guild_ids: &[i64],
    user_ids: &[i64],
    cumulative_xps: &[i32],
    current_levels: &[i32],
    current_xps: &[i32],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO levels (guild_id, user_id, cumulative_xp, current_level, current_xp)
        SELECT * FROM UNNEST($1::bigint[], $2::bigint[], $3::integer[], $4::integer[], $5::integer[])
        ON CONFLICT (guild_id, user_id) DO UPDATE SET
            cumulative_xp = EXCLUDED.cumulative_xp,
            current_level = EXCLUDED.current_level,
            current_xp = EXCLUDED.current_xp;
        "#,
        guild_ids,
        user_ids,
        cumulative_xps,
        current_levels,
        current_xps
    )
        .execute(db)
        .await?;

    Ok(())
}

pub async fn get_user_rank(db: &PgPool, guild_id: i64, user_id: i64, user_level: i32, user_xp: i32) -> Result<Option<i64>> {
    let rank = sqlx::query_scalar!(
        r#"
        SELECT COUNT(*) + 1
        FROM levels
        WHERE guild_id = $1
        AND (current_level > $2 OR (current_level = $2 AND current_xp > $3))
        "#,
        guild_id,
        user_level,
        user_xp
    )
        .fetch_one(db)
        .await?;

    Ok(rank)
}