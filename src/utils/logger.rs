use crate::types::Error;
use chrono::TimeDelta;
use serenity::all::{GuildId, User};
use sqlx::postgres::types::PgInterval;
use sqlx::PgPool;

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "varchar", rename_all = "snake_case")] // Adjust based on your DB setup
pub enum ActionType {
    Warn,
    DeleteWarning,
    Mute,
    Unmute,
    Kick,
    Ban,
    Unban,
    Softban,
    Lock,
    Pardon,
    Unpardon,
    Unlock,
    GlobalLock,
    GlobalUnlock,
}

pub(crate) async fn log_moderation_action(db: &PgPool, guild_id: GuildId, user: Option<&User>, moderator: &User, reason: Option<&str>, action: &str, interval: Option<TimeDelta>) -> Result<(), Error> {
    let pg_interval = interval.map(|delta| {
        let days = delta.num_days() as i32;
        let remaining = delta - TimeDelta::days(days as i64);
        PgInterval {
            months: 0,
            days,
            microseconds: remaining.num_microseconds().unwrap_or(0),
        }
    });

    sqlx::query!(
        r#"
        INSERT INTO moderation_logs (guild_id, target_id, moderator_id, action_type, reason, duration)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
        guild_id.get() as i64,
        user.map(|u| u.id.get() as i64),
        moderator.id.get() as i64,
        action,
        reason,
        pg_interval,
    )
        .execute(db)
        .await?;
    Ok(())
}
