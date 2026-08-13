use crate::features::moderation::{ActionType, log_moderation_action};
use crate::features::warning::types::{PartialWarning, WarnAction, WarnThreshold, WarningInfo};
use anyhow::Result;
use fred::clients::Client;
use fred::interfaces::{FredResult, KeysInterface};
use fred::prelude::Expiration;
use serenity::all::{GuildId, User, UserId};
use sqlx::PgPool;

pub async fn fetch_warnings(db: &PgPool, guild_id: i64, user_id: i64) -> Result<Vec<WarningInfo>, sqlx::Error> {
    sqlx::query_as!(
        WarningInfo,
        r#"
        SELECT id, user_id, moderator_id, reason, created_at, is_active
        FROM warns
        WHERE guild_id = ($1)
        AND user_id = ($2)
        AND is_active = TRUE
        ORDER BY created_at DESC;
        "#,
        guild_id,
        user_id,
    )
        .fetch_all(db)
        .await
}

pub async fn search_warnings_by_pattern(db: &PgPool, guild_id: i64, target_user_id: Option<i64>, pattern: &str) -> Result<Vec<WarningInfo>, sqlx::Error> {
    sqlx::query_as!(
        WarningInfo,
        r#"
        SELECT id, user_id, moderator_id, reason, created_at, is_active
        FROM warns
        WHERE guild_id = $1
          AND reason ILIKE $2
          AND ($3::BIGINT IS NULL OR user_id = $3)
        ORDER BY id DESC
        LIMIT 50
        "#,
        guild_id,
        pattern,
        target_user_id,
    )
        .fetch_all(db)
        .await
}

pub async fn search_warning_from_id(db: &PgPool, guild_id: i64, id: i64) -> Option<WarningInfo> {
    sqlx::query_as!(
        WarningInfo,
        r#"
        SELECT id, user_id, moderator_id, reason, created_at, is_active
        FROM warns
        WHERE id = $1 AND guild_id = $2
        "#,
        id,
        guild_id,
    )
        .fetch_optional(db)
        .await
        .ok()
        .flatten()
}

pub async fn update_warn(db: &PgPool, set_active: bool, id: i64, guild_id: i64, expected_current_state: bool) -> Result<Option<PartialWarning>, sqlx::Error> {
    sqlx::query_as!(
        PartialWarning,
        r#"
        UPDATE warns
        SET is_active = $1
        WHERE id = $2 AND guild_id = $3 AND is_active = $4
        RETURNING user_id, reason
        "#,
        set_active,
        id,
        guild_id,
        expected_current_state,
    )
        .fetch_optional(db)
        .await
}

pub async fn delete_warn(db: &PgPool, id: i64, guild_id: i64) -> Result<Option<PartialWarning>, sqlx::Error> {
    sqlx::query_as!(
        PartialWarning,
        r#"
        DELETE FROM warns
        WHERE id = $1 AND guild_id = $2
        RETURNING user_id, reason
        "#,
        id,
        guild_id
    )
        .fetch_optional(db)
        .await
}

pub async fn insert_warn(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    moderator_id: UserId,
    reason: &str,
) -> Result<(i64, i32), sqlx::Error> {
    let res = sqlx::query!(
        r#"
        WITH inserted AS (
            INSERT INTO warns (guild_id, user_id, moderator_id, reason)
            VALUES ($1, $2, $3, $4)
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
    )
        .fetch_one(db)
        .await?;

    Ok((res.id, res.count as i32))
}

pub async fn fetch_warn_thresholds(db: &PgPool, redis: &Client, guild_id: &GuildId) -> Result<Vec<WarnThreshold>> {
    let cache_key = format!("warn_thresholds:{}", guild_id.get());
    let cached_data: Option<String> = redis.get(&cache_key).await.ok();

    if let Some(json_string) = cached_data
        && let Ok(thresholds) = serde_json::from_str::<Vec<WarnThreshold>>(&json_string) { return Ok(thresholds); }

    let thresholds = sqlx::query_as!(
        WarnThreshold,
        r#"
            SELECT id, guild_id, warn_count, action_type as "action_type: Vec<WarnAction>", roles_to_add, roles_to_remove, duration
            FROM warn_thresholds
            WHERE guild_id = $1
        "#,
        guild_id.get() as i64,
    ).fetch_all(db).await?;

    if let Ok(json_string) = serde_json::to_string(&thresholds) {
        let _: FredResult<()> = redis.set(&cache_key, json_string, Some(Expiration::EX(86400)), None, false).await;
    }

    Ok(thresholds)
}

pub async fn log_warning(db: &PgPool, guild_id: GuildId, user: &User, moderator: &User, reason: &str) -> Result<()> {
    log_moderation_action(db, guild_id, Some(user), moderator, Some(reason), ActionType::Warn, None).await
}