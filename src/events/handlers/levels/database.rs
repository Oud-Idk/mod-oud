use crate::events::handlers::levels::levels_text::{LevelReward, UserLevel, XpMultiplier};
use crate::types::Error;
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