use crate::types::types::WarningInfo;
use sqlx::{Error, PgPool};

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

pub async fn search_warning_from_id(db: &PgPool, guild_id: i64, id: i32) -> Option<WarningInfo> {
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

pub struct PartialWarning {
    pub(crate) user_id: i64,
    pub(crate) reason: Option<String>,
}

pub async fn update_warn(db: &PgPool, set_active: bool, id: i32, guild_id: i64, expected_current_state: bool) -> Result<Option<PartialWarning>, Error> {
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

pub async fn delete_warn(db: &PgPool, id: i32, guild_id: i64) -> Result<Option<PartialWarning>, Error> {
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