use crate::core::config::state::Error;
use crate::features::birthday::types::{ExpiredRole, FullUserBirthdayRecord, UserBirthdayRecord};
use serenity::all::{ChannelId, GuildId, RoleId, UserId};
use serenity::model::id::MessageId;
use sqlx::PgPool;
use sqlx::postgres::PgQueryResult;

#[derive(sqlx::FromRow)]
struct RawUserBirthdayRecord {
    user_id: i64,
    birth_year: Option<i32>,
}

impl From<RawUserBirthdayRecord> for UserBirthdayRecord {
    fn from(r: RawUserBirthdayRecord) -> Self {
        Self {
            user_id: UserId::new(r.user_id.cast_unsigned()),
            birth_year: r.birth_year,
        }
    }
}

#[derive(sqlx::FromRow)]
#[allow(clippy::struct_field_names)]
struct RawExpiredRole {
    guild_id: i64,
    user_id: i64,
    role_id: i64,
}

impl From<RawExpiredRole> for ExpiredRole {
    fn from(r: RawExpiredRole) -> Self {
        Self {
            guild_id: GuildId::new(r.guild_id.cast_unsigned()),
            user_id: UserId::new(r.user_id.cast_unsigned()),
            role_id: RoleId::new(r.role_id.cast_unsigned()),
        }
    }
}

#[derive(sqlx::FromRow)]
struct RawFullUserBirthdayRecord {
    user_id: i64,
    birth_month: i16,
    birth_day: i16,
    birth_year: Option<i32>,
}

impl From<RawFullUserBirthdayRecord> for FullUserBirthdayRecord {
    fn from(r: RawFullUserBirthdayRecord) -> Self {
        Self {
            user_id: UserId::new(r.user_id.cast_unsigned()),
            birth_month: r.birth_month,
            birth_day: r.birth_day,
            birth_year: r.birth_year,
        }
    }
}

pub async fn store_birthday_log(
    db: &PgPool,
    current_year: i32,
    guild_id: GuildId,
    channel_id: ChannelId,
    sent_msg_id: Option<MessageId>,
    uid: UserId,
) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO birthday_logs (guild_id, user_id, year_sent, channel_id, message_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (guild_id, user_id, year_sent) DO NOTHING
        "#,
        guild_id.get().cast_signed(),
        uid.get().cast_signed(),
        current_year,
        channel_id.get().cast_signed(),
        sent_msg_id.map(|m| m.get().cast_signed()),
    )
    .execute(db)
    .await
}

pub async fn get_unannounced_birthdays(
    db: &PgPool,
    current_month: i16,
    current_day: i16,
    current_year: i32,
    guild_id: GuildId,
) -> Result<Vec<UserBirthdayRecord>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawUserBirthdayRecord,
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
        guild_id.get().cast_signed(),
        current_year
    )
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn save_user_with_birthday_role(
    db: &PgPool,
    guild_id: GuildId,
    uid: UserId,
    role_id: RoleId,
) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO active_birthday_roles (guild_id, user_id, role_id, expires_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
        ON CONFLICT (guild_id, user_id) DO UPDATE
        SET expires_at = EXCLUDED.expires_at
        "#,
        guild_id.get().cast_signed(),
        uid.get().cast_signed(),
        role_id.get().cast_signed(),
    )
    .execute(db)
    .await
}

pub async fn fetch_expired_birthday_roles(pool: &PgPool) -> Result<Vec<ExpiredRole>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawExpiredRole,
        r#"
        SELECT guild_id, user_id, role_id
        FROM active_birthday_roles
        WHERE expires_at <= CURRENT_TIMESTAMP
        "#
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn fetch_enabled_guild_ids(
    db: &PgPool,
    current_hour: u32,
) -> Result<Vec<GuildId>, sqlx::Error> {
    let ids = sqlx::query_scalar!(
        r#"
        SELECT guild_id
        FROM guild_configs
        WHERE (settings->'birthday'->>'enabled')::boolean = TRUE
          AND (settings->'birthday'->>'announcement_hour')::int = $1
          AND settings->'birthday'->>'channel_id' IS NOT NULL
        "#,
        i32::try_from(current_hour)
            .expect("Since when is there more than 2 billion hours in a day")
    )
    .fetch_all(db)
    .await?;

    Ok(ids
        .into_iter()
        .map(i64::cast_unsigned)
        .map(GuildId::from)
        .collect())
}

pub async fn delete_expired_birthday_roles(
    pool: &PgPool,
    guild_ids: &[GuildId],
    user_ids: &[UserId],
) -> Result<(), sqlx::Error> {
    if guild_ids.is_empty() || user_ids.is_empty() {
        return Ok(());
    }

    let raw_guild_ids: Vec<i64> = guild_ids.iter().map(|id| id.get().cast_signed()).collect();
    let raw_user_ids: Vec<i64> = user_ids.iter().map(|id| id.get().cast_signed()).collect();

    sqlx::query!(
        r#"
        DELETE FROM active_birthday_roles
        WHERE (guild_id, user_id) IN (
            SELECT * FROM UNNEST($1::bigint[], $2::bigint[])
        )
        "#,
        &raw_guild_ids[..],
        &raw_user_ids[..],
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn set_birthday(
    db: &PgPool,
    user_id: u64,
    month_num: i16,
    day: i16,
    year: Option<i32>,
) -> Result<(), Error> {
    sqlx::query!(
        r#"
        INSERT INTO user_birthdays (user_id, birth_month, birth_day, birth_year)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE
        SET birth_month = EXCLUDED.birth_month,
            birth_day = EXCLUDED.birth_day,
            birth_year = EXCLUDED.birth_year
        "#,
        user_id.cast_signed(),
        month_num,
        day,
        year
    )
    .execute(db)
    .await?;

    Ok(())
}

/// Fetches upcoming birthdays within N days (handles year-end wrap-around)
pub async fn get_upcoming_birthdays(
    db: &PgPool,
    lookahead_days: i32,
) -> Result<Vec<FullUserBirthdayRecord>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawFullUserBirthdayRecord,
        r#"
        SELECT user_id, birth_month, birth_day, birth_year
        FROM user_birthdays
        WHERE (
            (MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::int, birth_month, birth_day) - CURRENT_DATE + 365) % 365
        ) BETWEEN 0 AND $1
        ORDER BY
            ((MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::int, birth_month, birth_day) - CURRENT_DATE + 365) % 365)
        LIMIT 25
        "#,
        lookahead_days
    )
        .fetch_all(db)
        .await?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/// Get a user's birthday record
pub async fn get_user_birthday(
    db: &PgPool,
    user_id: UserId,
) -> Result<Option<FullUserBirthdayRecord>, sqlx::Error> {
    let row = sqlx::query_as!(
        RawFullUserBirthdayRecord,
        r#"
        SELECT user_id, birth_month, birth_day, birth_year
        FROM user_birthdays
        WHERE user_id = $1
        "#,
        user_id.get().cast_signed()
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(Into::into))
}

/// Remove a user's birthday record
pub async fn remove_birthday(db: &PgPool, user_id: UserId) -> Result<(), Error> {
    sqlx::query!(
        r#"
        DELETE FROM user_birthdays
        WHERE user_id = $1
        "#,
        user_id.get().cast_signed()
    )
    .execute(db)
    .await?;

    Ok(())
}
