use crate::features::moderation::{ActionType, log_moderation_action};
use crate::features::warning::cache;
use crate::features::warning::types::{PartialWarning, WarnAction, WarnThreshold, WarningInfo};
use anyhow::Result;
use fred::clients::Client;
use serenity::all::{GuildId, RoleId, User, UserId};
use sqlx::PgPool;

#[derive(sqlx::FromRow)]
struct PartialWarningRow {
    user_id: i64,
    reason: Option<String>,
}

impl From<PartialWarningRow> for PartialWarning {
    fn from(row: PartialWarningRow) -> Self {
        Self {
            user_id: UserId::new(row.user_id.cast_unsigned()),
            reason: row.reason,
        }
    }
}

#[derive(sqlx::FromRow)]
struct WarnThresholdRow {
    id: i64,
    guild_id: i64,
    warn_count: i32,
    action_type: Vec<WarnAction>,
    roles_to_add: Option<Vec<i64>>,
    roles_to_remove: Option<Vec<i64>>,
    duration: Option<i32>,
}

impl From<WarnThresholdRow> for WarnThreshold {
    fn from(row: WarnThresholdRow) -> Self {
        Self {
            id: row.id,
            guild_id: GuildId::new(row.guild_id.cast_unsigned()),
            warn_count: row.warn_count,
            action_type: row.action_type,
            roles_to_add: row.roles_to_add.map(|roles| {
                roles
                    .into_iter()
                    .map(|id| RoleId::new(id.cast_unsigned()))
                    .collect()
            }),
            roles_to_remove: row.roles_to_remove.map(|roles| {
                roles
                    .into_iter()
                    .map(|id| RoleId::new(id.cast_unsigned()))
                    .collect()
            }),
            duration: row.duration,
        }
    }
}

#[derive(sqlx::FromRow)]
struct WarningInfoRow {
    id: i64,
    user_id: i64,
    moderator_id: i64,
    reason: Option<String>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
    is_active: Option<bool>,
}

impl From<WarningInfoRow> for WarningInfo {
    fn from(row: WarningInfoRow) -> Self {
        Self {
            id: row.id,
            user_id: UserId::new(row.user_id.cast_unsigned()),
            moderator_id: UserId::new(row.moderator_id.cast_unsigned()),
            reason: row.reason,
            created_at: row.created_at,
            is_active: row.is_active,
        }
    }
}

pub async fn fetch_warnings(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Vec<WarningInfo>, sqlx::Error> {
    sqlx::query_as!(
        WarningInfoRow,
        r#"
        SELECT id, user_id, moderator_id, reason, created_at, is_active
        FROM warns
        WHERE guild_id = ($1)
        AND user_id = ($2)
        AND is_active = TRUE
        ORDER BY created_at DESC;
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
    )
    .fetch_all(db)
    .await
    .map(|rows| rows.into_iter().map(WarningInfo::from).collect())
}

pub async fn search_warnings_by_pattern(
    db: &PgPool,
    guild_id: GuildId,
    target_user_id: Option<UserId>,
    pattern: &str,
) -> Result<Vec<WarningInfo>, sqlx::Error> {
    sqlx::query_as!(
        WarningInfoRow,
        r#"
        SELECT id, user_id, moderator_id, reason, created_at, is_active
        FROM warns
        WHERE guild_id = $1
          AND reason ILIKE $2
          AND ($3::BIGINT IS NULL OR user_id = $3)
        ORDER BY id DESC
        LIMIT 50
        "#,
        guild_id.get().cast_signed(),
        pattern,
        target_user_id.map(|id| id.get().cast_signed()),
    )
    .fetch_all(db)
    .await
    .map(|rows| rows.into_iter().map(WarningInfo::from).collect())
}

pub async fn search_warning_from_id(db: &PgPool, guild_id: u64, id: i64) -> Option<WarningInfo> {
    sqlx::query_as!(
        WarningInfoRow,
        r#"
        SELECT id, user_id, moderator_id, reason, created_at, is_active
        FROM warns
        WHERE id = $1 AND guild_id = $2
        "#,
        id,
        guild_id.cast_signed(),
    )
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .map(WarningInfo::from)
}

pub async fn update_warn(
    db: &PgPool,
    set_active: bool,
    id: i64,
    guild_id: u64,
    expected_current_state: bool,
) -> Result<Option<PartialWarning>, sqlx::Error> {
    sqlx::query_as!(
        PartialWarningRow,
        r#"
        UPDATE warns
        SET is_active = $1
        WHERE id = $2 AND guild_id = $3 AND is_active = $4
        RETURNING user_id, reason
        "#,
        set_active,
        id,
        guild_id.cast_signed(),
        expected_current_state,
    )
    .fetch_optional(db)
    .await
    .map(|row| row.map(PartialWarning::from))
}

pub async fn delete_warn(
    db: &PgPool,
    id: i64,
    guild_id: u64,
) -> Result<Option<PartialWarning>, sqlx::Error> {
    sqlx::query_as!(
        PartialWarningRow,
        r#"
        DELETE FROM warns
        WHERE id = $1 AND guild_id = $2
        RETURNING user_id, reason
        "#,
        id,
        guild_id.cast_signed()
    )
    .fetch_optional(db)
    .await
    .map(|row| row.map(PartialWarning::from))
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
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        moderator_id.get().cast_signed(),
        reason,
    )
    .fetch_one(db)
    .await?;

    Ok((res.id, i32::try_from(res.count).unwrap_or(i32::MAX)))
}

pub async fn fetch_warn_thresholds(
    db: &PgPool,
    redis: &Client,
    guild_id: &GuildId,
) -> Result<Vec<WarnThreshold>> {
    let cache_key = format!("warn_thresholds:{}", guild_id.get());
    if let Some(thresholds) = cache::get_cached_warn_thresholds(redis, &cache_key).await {
        return Ok(thresholds);
    }

    let thresholds = sqlx::query_as!(
        WarnThresholdRow,
        r#"
            SELECT id, guild_id, warn_count, action_type as "action_type: Vec<WarnAction>", roles_to_add, roles_to_remove, duration
            FROM warn_thresholds
            WHERE guild_id = $1
        "#,
        guild_id.get().cast_signed(),
    ).fetch_all(db).await?.into_iter().map(WarnThreshold::from).collect::<Vec<_>>();

    cache::cache_warn_thresholds(redis, &cache_key, &thresholds).await;

    Ok(thresholds)
}

pub async fn log_warning(
    db: &PgPool,
    guild_id: GuildId,
    user: &User,
    moderator: &User,
    reason: &str,
) -> Result<()> {
    log_moderation_action(
        db,
        guild_id,
        Some(user),
        moderator,
        Some(reason),
        ActionType::Warn,
        None,
    )
    .await
}
