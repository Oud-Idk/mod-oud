use chrono::{DateTime, Utc};
use sqlx::types::Json;

use crate::core::config::message_layout::MessageLayout;
use crate::features::reminder::types::{ReminderRecord, ReminderType};

/// Fetches up to `limit` active reminders that are ready to trigger.
pub async fn fetch_due_reminders(
    db: &sqlx::PgPool,
    until: DateTime<Utc>,
    limit: i64,
) -> Result<Vec<ReminderRecord>, sqlx::Error> {
    sqlx::query_as!(
        ReminderRecord,
        r#"
        SELECT
            id,
            channel_id,
            message AS "message: Json<MessageLayout>",
            r_type AS "r_type: ReminderType",
            days_of_week,
            time_start,
            time_end,
            interval_seconds,
            timezone
        FROM reminders
        WHERE next_trigger_at <= $1 AND is_active = true
        ORDER BY next_trigger_at ASC
        LIMIT $2
        "#,
        until,
        limit
    )
    .fetch_all(db)
    .await
}

/// Updates the next trigger timestamp for a recurring reminder.
pub async fn update_reminder_next_trigger(
    db: &sqlx::PgPool,
    id: i64,
    next_trigger: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE reminders SET next_trigger_at = $1 WHERE id = $2",
        next_trigger,
        id
    )
    .execute(db)
    .await?;

    Ok(())
}

/// Deactivates a reminder after completion or expiration.
pub async fn deactivate_reminder(db: &sqlx::PgPool, id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("UPDATE reminders SET is_active = false WHERE id = $1", id)
        .execute(db)
        .await?;

    Ok(())
}
