use crate::features::birthday::types::{ExpiredRole, UserBirthdayRecord};
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