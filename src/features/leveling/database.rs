use crate::core::config::settings::get_settings;
use crate::core::config::state::BotData;
use crate::features::leveling::cache;
use crate::features::leveling::types::{LevelReward, LevelingConfig, UserLevel, XpMultiplier};
use anyhow::Result;
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use serenity::all::{GuildId, RoleId, UserId};
use sqlx::PgPool;
use sqlx::postgres::PgQueryResult;
use tracing::trace;

pub async fn get_level(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Option<UserLevel>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        SELECT guild_id, user_id, cumulative_xp, current_level, current_xp
        FROM levels
        WHERE user_id = $1 AND guild_id = $2
        "#,
        user_id.get() as i64,
        guild_id.get().cast_signed(),
    )
        .fetch_optional(db)
        .await?;

    Ok(row.map(|r| UserLevel::from_raw(r.guild_id, r.user_id, r.cumulative_xp, r.current_level, r.current_xp)))
}

pub async fn insert_level(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId
) -> Result<UserLevel, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        INSERT INTO levels (user_id, guild_id)
        VALUES ($1, $2)
        RETURNING guild_id, user_id, cumulative_xp, current_level, current_xp
        "#,
        user_id.get() as i64,
        guild_id.get().cast_signed(),
    )
        .fetch_one(db)
        .await?;

    Ok(UserLevel::from_raw(row.guild_id, row.user_id, row.cumulative_xp, row.current_level, row.current_xp))
}

pub async fn update_level(db: &PgPool, user_level: &UserLevel) -> Result<PgQueryResult> {
    let result = sqlx::query!(
        "UPDATE levels
         SET cumulative_xp = $1, current_level = $2, current_xp = $3
         WHERE user_id = $4 AND guild_id = $5",
        user_level.cumulative_xp,
        user_level.current_level,
        user_level.current_xp,
        user_level.user_id.get().cast_signed(),
        user_level.guild_id.get().cast_signed(),
    )
        .execute(db)
        .await?;

    Ok(result)
}

pub async fn get_multipliers(db: &PgPool, guild_id: u64) -> Result<Vec<XpMultiplier>> {
    let multipliers = sqlx::query_as!(
        XpMultiplier,
        r#"
        SELECT target_id, target_type AS "target_type!", multiplier AS "multiplier!"
        FROM xp_multipliers
        WHERE guild_id = $1
        "#,
        guild_id.cast_signed()
    )
        .fetch_all(db)
        .await?;

    Ok(multipliers)
}

/// Fetches all level rewards for a specific guild
pub async fn fetch_level_rewards(db: &PgPool, guild_id: GuildId) -> Result<Vec<LevelReward>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT level_requirement, roles_to_add, remove_previous_roles
        FROM level_rewards
        WHERE guild_id = $1
        "#,
        guild_id.get().cast_signed()
    )
        .fetch_all(db)
        .await?;

    let rewards = rows
        .into_iter()
        .map(|row| LevelReward {
            level_requirement: row.level_requirement,
            roles_to_add: row.roles_to_add.map(|roles| {
                roles
                    .into_iter()
                    .map(|id| RoleId::new(id as u64))
                    .collect()
            }),
            remove_previous_roles: row.remove_previous_roles,
        })
        .collect();

    Ok(rewards)
}

pub async fn get_user_level(
    redis: &Client,
    db: &PgPool,
    guild_id: GuildId,
    author_id: UserId,
    stats_key: &str,
    _username: &str,
) -> Result<UserLevel> {
    let cached_user: Option<String> = redis.get(stats_key).await?;

    if let Some(json_data) = cached_user {
        Ok(serde_json::from_str::<UserLevel>(&json_data)?)
    } else {
        let db_user = get_level(db, guild_id, author_id).await?;

        let user = match db_user {
            Some(user) => user,
            None => insert_level(db, guild_id, author_id).await?,
        };

        let serialized = serde_json::to_string(&user)?;
        let _: () = cache::save_user_level_cache(redis, stats_key, serialized).await?;

        Ok(user)
    }
}

pub async fn load_leveling_config(
    data: &BotData,
    guild_id: GuildId,
) -> Result<Option<Box<LevelingConfig>>> {
    let config = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
        .await?;

    let Some(leveling_config) = config.leveling else {
        trace!(
            %guild_id,
            "Skipping XP reward: leveling system is unconfigured"
        );
        return Ok(None);
    };

    if !leveling_config.voice.enabled {
        trace!(
            %guild_id,
            "Skipping XP reward: voice leveling is disabled"
        );
        return Ok(None);
    }

    Ok(Some(leveling_config))
}


pub async fn upsert_level(
    db: &PgPool,
    guild_ids: &[GuildId],
    user_ids: &[UserId],
    cumulative_xps: &[i32],
    current_levels: &[i32],
    current_xps: &[i32],
) -> Result<(), sqlx::Error> {
    let raw_guild_ids: Vec<i64> = guild_ids.iter().map(|&id| id.get() as i64).collect();
    let raw_user_ids: Vec<i64> = user_ids.iter().map(|&id| id.get() as i64).collect();

    sqlx::query!(
        r#"
        INSERT INTO levels (guild_id, user_id, cumulative_xp, current_level, current_xp)
        SELECT * FROM UNNEST(
            $1::bigint[],
            $2::bigint[],
            $3::integer[],
            $4::integer[],
            $5::integer[]
        )
        ON CONFLICT (guild_id, user_id) DO UPDATE SET
            cumulative_xp = EXCLUDED.cumulative_xp,
            current_level = EXCLUDED.current_level,
            current_xp = EXCLUDED.current_xp;
        "#,
        &raw_guild_ids,
        &raw_user_ids,
        cumulative_xps,
        current_levels,
        current_xps
    )
        .execute(db)
        .await?;

    Ok(())
}

pub async fn get_user_rank(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Option<i64>, sqlx::Error> {
    let rank = sqlx::query_scalar!(
        r#"
        SELECT (COUNT(*) + 1) AS "rank!"
        FROM levels
        WHERE guild_id = $1
          AND cumulative_xp > (
              SELECT cumulative_xp
              FROM levels
              WHERE guild_id = $1 AND user_id = $2
          )
        "#,
        guild_id.get().cast_signed(),
        user_id.get() as i64
    )
        .fetch_optional(db)
        .await?;

    Ok(rank)
}
