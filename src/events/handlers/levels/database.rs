use crate::events::handlers::levels::levels_text::{calculation, LevelReward, UserLevel, XpMultiplier};
use crate::types::config::leveling::LevelingConfig;
use crate::types::Error;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serenity::all::{GuildId, UserId};
use sqlx::postgres::PgQueryResult;
use sqlx::PgPool;

pub async fn get_level(db: &PgPool, guild_id: GuildId, user_id: UserId) -> Result<Option<UserLevel>, sqlx::Error> {
    sqlx::query_as!(
        UserLevel,
        "SELECT guild_id, user_id, cumulative_xp, current_level, current_xp
        FROM levels
        WHERE user_id = $1 AND guild_id = $2",
        user_id.to_string(),
        guild_id.to_string(),
    ).fetch_optional(db).await
}

pub async fn insert_level(db: &PgPool, guild_id: GuildId, user_id: UserId) -> Result<UserLevel, sqlx::Error> {
    sqlx::query_as!(
        UserLevel,
        "INSERT INTO levels (user_id, guild_id)
         VALUES ($1, $2)
         RETURNING guild_id, user_id, cumulative_xp, current_level, current_xp",
        user_id.to_string(),
        guild_id.to_string()
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

pub async fn get_user_level(conn: &mut MultiplexedConnection, db: &PgPool, guild_id: &GuildId, author_id: &UserId, stats_key: &str) -> Result<UserLevel, Error> {
    let cached_user: Option<String> = conn.get(&stats_key).await?;

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
            let _: () = conn.set_ex(&stats_key, serialized, 3600).await?;

            Ok(user)
        }
    }
}

pub async fn clamp_to_level_cap(leveling_config: &LevelingConfig, redis: &mut MultiplexedConnection, db: &PgPool, stats_key: &String, mut user_level: &mut UserLevel) -> Result<bool, Error> {
    if leveling_config.level_cap > 0 && user_level.current_level >= leveling_config.level_cap as i32 {
        let mut needs_update = false;
        if user_level.current_level > leveling_config.level_cap as i32 {
            user_level.current_level = leveling_config.level_cap as i32;
            needs_update = true;
        }
        if user_level.current_xp > 0 {
            user_level.current_xp = 0;
            needs_update = true;
        }
        if needs_update {
            user_level.cumulative_xp = calculation::calculate_cumulative_xp(user_level.current_level, user_level.current_xp);
            update_level(db, &user_level).await?;
            let serialized = serde_json::to_string(&user_level)?;
            let _: () = redis.set_ex(&stats_key, serialized, 3600).await?;
        }
        return Ok(true);
    }
    Ok(false)
}