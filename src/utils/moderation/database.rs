use crate::types::Error;
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::prelude::{Expiration, FredResult};
use serde::{Deserialize, Serialize};
use serenity::all::{GuildId, UserId};
use sqlx::postgres::types::PgInterval;
use sqlx::PgPool;

#[derive(Debug, Clone, Copy, sqlx::Type, PartialEq, Eq, Deserialize, Serialize)]
#[sqlx(type_name = "moderation_action", rename_all = "snake_case")]
pub enum ModerationAction {
    Timeout,
    Kick,
    Ban,
    RoleRemove,
    RoleAdd,
    RoleRemoveAll,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WarnThreshold {
    pub id: i32,
    pub guild_id: String,
    pub warn_count: i32,
    pub action_type: Vec<ModerationAction>,
    pub roles_to_add: Option<Vec<String>>,
    pub roles_to_remove: Option<Vec<String>>,
    pub duration: Option<i32>,
}

pub async fn log_warning(db: &PgPool, guild_id: GuildId, user_id: UserId, moderator_id: UserId, reason: &str, moderator_username: &str, target_username: &str) -> Result<(), Error> {
    sqlx::query!(
        r#"
        INSERT INTO moderation_logs (guild_id, target_id, moderator_id, action_type, reason, duration, moderator_username, target_username)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
        guild_id.get() as i64,
        user_id.get() as i64,
        moderator_id.get() as i64,
        "warn",
        reason,
        None::<PgInterval>,
        moderator_username,
        target_username,
    )
        .execute(db)
        .await?;
    Ok(())
}

pub async fn insert_warn(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    moderator_id: UserId,
    reason: &str,
    moderator_username: &str,
    target_username: &str
) -> Result<(i32, i32), sqlx::Error> {
    let res = sqlx::query!(
        r#"
        WITH inserted AS (
            INSERT INTO warns (guild_id, user_id, moderator_id, reason, moderator_name, user_name)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        )
        SELECT
            inserted.id,
            (SELECT count(*) FROM warns WHERE guild_id = $1 AND user_id = $2) + 1 AS "count!"
        FROM inserted
        "#,
        guild_id.get() as i64,
        user_id.get() as i64,
        moderator_id.get() as i64,
        reason,
        moderator_username,
        target_username,
    )
        .fetch_one(db)
        .await?;

    Ok((res.id, res.count as i32))
}

pub async fn fetch_warn_thresholds(db: &PgPool, redis: &Client, guild_id: &GuildId) -> Result<Vec<WarnThreshold>, anyhow::Error> {
    let cache_key = format!("warn_thresholds:{}", guild_id.get());
    let cached_data: Option<String> = redis.get(&cache_key).await.ok();

    if let Some(json_string) = cached_data {
        if let Ok(thresholds) = serde_json::from_str::<Vec<WarnThreshold>>(&json_string) { return Ok(thresholds); }
    }

    let thresholds = sqlx::query_as!(
        WarnThreshold,
        r#"
            SELECT id, guild_id, warn_count, action_type as "action_type: Vec<ModerationAction>", roles_to_add, roles_to_remove, duration
            FROM warn_thresholds
            WHERE guild_id = $1
        "#,
        guild_id.to_string(),
    ).fetch_all(db).await?;

    if let Ok(json_string) = serde_json::to_string(&thresholds) {
        let _: FredResult<()> = redis.set(&cache_key, json_string, Some(Expiration::EX(86400)), None, false).await;
    }

    Ok(thresholds)
}