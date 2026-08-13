use anyhow::Result;
use chrono::TimeDelta;
use serenity::all::{GuildId, User};
use sqlx::postgres::types::PgInterval;
use sqlx::PgPool;
use crate::features::moderation::ActionType;
use crate::features::moderation::types::TempBanRecord;

trait ToPgInterval {
    fn to_pg_interval(&self) -> PgInterval;
}

impl ToPgInterval for TimeDelta {
    fn to_pg_interval(&self) -> PgInterval {
        let days = self.num_days() as i32;
        let remaining = *self - Self::days(i64::from(days));
        PgInterval {
            months: 0,
            days,
            microseconds: remaining.num_microseconds().unwrap_or(0),
        }
    }
}

pub async fn log_moderation_action(
    db: &PgPool,
    guild_id: GuildId,
    user: Option<&User>,
    moderator: &User,
    reason: Option<&str>,
    action: ActionType,
    interval: Option<TimeDelta>,
) -> Result<()> {
    let pg_interval = interval.map(|delta| delta.to_pg_interval());

    sqlx::query!(
        r#"
        INSERT INTO moderation_logs (guild_id, target_id, moderator_id, action_type, reason, duration)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
        guild_id.get() as i64,
        user.map(|u| u.id.get() as i64),
        moderator.id.get() as i64,
        action as ActionType,
        reason,
        pg_interval,
    )
        .execute(db)
        .await?;
    Ok(())
}

/// Fetches expired temp bans up to a limit of 200.
pub async fn fetch_expired_temp_bans(
    db: &PgPool,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<Vec<TempBanRecord>> {
    Ok(sqlx::query_as!(
        TempBanRecord,
        r#"
        SELECT id, guild_id, user_id FROM temp_bans
        WHERE unban_at <= $1
        LIMIT 200
        "#,
        now
    )
        .fetch_all(db)
        .await?)
}

/// Deletes processed temp ban records by ID.
pub async fn delete_processed_temp_bans(
    db: &PgPool,
    ids: &[i64],
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM temp_bans WHERE id = ANY($1)",
        ids
    )
        .execute(db)
        .await?;

    Ok(result.rows_affected())
}