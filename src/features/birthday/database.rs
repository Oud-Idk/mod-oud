use crate::Error;
use crate::features::birthday::types::{ExpiredRole, FullUserBirthdayRecord, UserBirthdayRecord};
use serenity::all::{ChannelId, RoleId};
use sqlx::PgPool;
use sqlx::postgres::PgQueryResult;

pub async fn store_birthday_log(db: &PgPool, current_year: i32, guild_id: i64, channel_id: ChannelId, sent_msg_id: Option<i64>, uid: i64) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO birthday_logs (guild_id, user_id, year_sent, channel_id, message_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (guild_id, user_id, year_sent) DO NOTHING
        "#,
        guild_id,
        uid,
        current_year as i16,
        channel_id.get() as i64,
        sent_msg_id
    )
        .execute(db)
        .await
}

pub async fn get_unannounced_birthdays(db: &PgPool, current_month: i16, current_day: i16, current_year: i32, guild_id: i64) -> Result<Vec<UserBirthdayRecord>, sqlx::Error> {
    sqlx::query_as!(
        UserBirthdayRecord,
        r#"
        SELECT ub.user_id, ub.birth_year
        FROM user_birthdays ub
        WHERE ub.birth_month = $1
          AND ub.birth_day = $2
          AND NOT EXISTS (
              SELECT 1 FROM birthday_logs bl
              WHERE bl.guild_id = $3
                AND bl.user_id = ub.user_id
                AND bl.year_sent = $4
          )
        "#,
        current_month,
        current_day,
        guild_id,
        current_year as i16
    )
        .fetch_all(db)
        .await
}

pub async fn save_user_with_birthday_role(db: &PgPool, guild_id: i64, uid: i64, role_id: RoleId) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO active_birthday_roles (guild_id, user_id, role_id, expires_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
        ON CONFLICT (guild_id, user_id) DO UPDATE
        SET expires_at = EXCLUDED.expires_at
        "#,
        guild_id,
        uid,
        role_id.get() as i64
    ).execute(db).await
}

pub async fn fetch_expired_birthday_roles(pool: &PgPool) -> Result<Vec<ExpiredRole>, sqlx::Error> {
    sqlx::query_as!(
        ExpiredRole,
        r#"
        SELECT guild_id, user_id, role_id
        FROM active_birthday_roles
        WHERE expires_at <= CURRENT_TIMESTAMP
        "#,
    )
        .fetch_all(pool)
        .await
}

pub async fn fetch_enabled_guild_ids(db: &PgPool, current_hour: i32) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"
        SELECT guild_id
        FROM guild_configs
        WHERE (settings->'birthday'->>'enabled')::boolean = TRUE
          AND (settings->'birthday'->>'announcement_hour')::int = $1
          AND settings->'birthday'->>'channel_id' IS NOT NULL
        "#,
        current_hour
    )
        .fetch_all(db)
        .await
}

pub async fn delete_expired_birthday_roles(
    pool: &PgPool,
    guild_ids: &[i64],
    user_ids: &[i64],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM active_birthday_roles
        WHERE (guild_id, user_id) IN (
            SELECT * FROM UNNEST($1::bigint[], $2::bigint[])
        )
        "#,
        guild_ids,
        user_ids
    )
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn set_birthday(db: &PgPool, uid: u64, month_num: i16, day: i16, year: Option<i16>) -> Result<(), Error> {
    sqlx::query!(
        r#"
        INSERT INTO user_birthdays (user_id, birth_month, birth_day, birth_year)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE
        SET birth_month = EXCLUDED.birth_month,
            birth_day = EXCLUDED.birth_day,
            birth_year = EXCLUDED.birth_year
        "#,
        uid as i64,
        month_num,
        day,
        year
    )
        .execute(db)
        .await?;
    Ok(())
}

/// Fetches upcoming birthdays within N days
pub async fn get_upcoming_birthdays(
    db: &PgPool,
    lookahead_days: i32,
) -> Result<Vec<FullUserBirthdayRecord>, sqlx::Error> {
    sqlx::query_as!(
        FullUserBirthdayRecord,
        r#"
        SELECT user_id, birth_month, birth_day, birth_year
        FROM user_birthdays
        WHERE MAKE_DATE(2000, birth_month, birth_day) >= MAKE_DATE(2000, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(DAY FROM CURRENT_DATE)::int)
          AND MAKE_DATE(2000, birth_month, birth_day) <= MAKE_DATE(2000, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(DAY FROM CURRENT_DATE)::int) + ($1::int * INTERVAL '1 day')
        ORDER BY birth_month, birth_day
        LIMIT 25
        "#,
        lookahead_days
    )
        .fetch_all(db)
        .await
}

/// Get a user's birthday record
pub async fn get_user_birthday(
    db: &PgPool,
    uid: u64,
) -> Result<Option<FullUserBirthdayRecord>, sqlx::Error> {
    sqlx::query_as!(
        FullUserBirthdayRecord,
        r#"
        SELECT user_id, birth_month, birth_day, birth_year
        FROM user_birthdays
        WHERE user_id = $1
        "#,
        uid as i64
    )
        .fetch_optional(db)
        .await
}

/// Remove a user's birthday record
pub async fn remove_birthday(
    db: &PgPool,
    uid: u64,
) -> Result<(), Error> {
    sqlx::query!(
        r#"
        DELETE FROM user_birthdays
        WHERE user_id = $1
        "#,
        uid as i64
    )
        .execute(db)
        .await?;
    Ok(())
}