use crate::core::config::settings::get_settings;
use crate::core::config::state::BotData;
use crate::features::leveling::cache;
use crate::features::leveling::types::{LevelReward, LevelingConfig, UserLevel, XpMultiplier};
use anyhow::Result;
use fred::clients::Client;
use serenity::all::{GuildId, RoleId, UserId};
use sqlx::PgPool;
use sqlx::postgres::PgQueryResult;
use tracing::trace;

#[derive(sqlx::FromRow)]
struct RawUserLevel {
    guild_id: i64,
    user_id: i64,
    cumulative_xp: i64,
    current_level: i64,
    current_xp: i64,
}

impl From<RawUserLevel> for UserLevel {
    fn from(r: RawUserLevel) -> Self {
        Self {
            guild_id: GuildId::new(r.guild_id.cast_unsigned()),
            user_id: UserId::new(r.user_id.cast_unsigned()),
            cumulative_xp: r.cumulative_xp,
            current_level: r.current_level,
            current_xp: r.current_xp,
        }
    }
}

#[derive(sqlx::FromRow)]
struct RawLevelReward {
    level_requirement: i64,
    roles_to_add: Option<Vec<i64>>,
    remove_previous_roles: Option<bool>,
}

impl From<RawLevelReward> for LevelReward {
    fn from(r: RawLevelReward) -> Self {
        Self {
            level_requirement: r.level_requirement,
            roles_to_add: r.roles_to_add.map(|roles| {
                roles
                    .into_iter()
                    .map(|id| RoleId::new(id.cast_unsigned()))
                    .collect()
            }),
            remove_previous_roles: r.remove_previous_roles,
        }
    }
}

pub async fn get_level(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Option<UserLevel>, sqlx::Error> {
    let row = sqlx::query_as!(
        RawUserLevel,
        r#"
        SELECT guild_id, user_id, cumulative_xp, current_level, current_xp
        FROM levels
        WHERE user_id = $1 AND guild_id = $2
        "#,
        user_id.get().cast_signed(),
        guild_id.get().cast_signed(),
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(Into::into))
}

pub async fn insert_level(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<UserLevel, sqlx::Error> {
    let row = sqlx::query_as!(
        RawUserLevel,
        r#"
        INSERT INTO levels (user_id, guild_id)
        VALUES ($1, $2)
        RETURNING guild_id, user_id, cumulative_xp, current_level, current_xp
        "#,
        user_id.get().cast_signed(),
        guild_id.get().cast_signed(),
    )
    .fetch_one(db)
    .await?;

    Ok(row.into())
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
pub async fn fetch_level_rewards(
    db: &PgPool,
    guild_id: GuildId,
) -> Result<Vec<LevelReward>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawLevelReward,
        r#"
        SELECT level_requirement, roles_to_add, remove_previous_roles
        FROM level_rewards
        WHERE guild_id = $1
        "#,
        guild_id.get().cast_signed()
    )
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn get_user_level(
    redis: &Client,
    db: &PgPool,
    guild_id: GuildId,
    author_id: UserId,
    stats_key: &str,
    _username: &str,
) -> Result<UserLevel> {
    let cached_user = cache::get_cached_user_level(redis, stats_key).await?;

    if let Some(user) = cached_user {
        Ok(user)
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
    cumulative_xps: &[i64],
    current_levels: &[i64],
    current_xps: &[i64],
) -> Result<(), sqlx::Error> {
    let raw_guild_ids: Vec<i64> = guild_ids.iter().map(|&id| id.get().cast_signed()).collect();
    let raw_user_ids: Vec<i64> = user_ids.iter().map(|&id| id.get().cast_signed()).collect();

    sqlx::query!(
        r#"
        INSERT INTO levels (guild_id, user_id, cumulative_xp, current_level, current_xp)
        SELECT * FROM UNNEST(
            $1::bigint[],
            $2::bigint[],
            $3::bigint[],
            $4::bigint[],
            $5::bigint[]
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
        user_id.get().cast_signed(),
    )
    .fetch_optional(db)
    .await?;

    Ok(rank)
}
