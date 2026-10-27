use chrono::{DateTime, Duration, NaiveTime, Utc};
use sqlx::types::Json;

use crate::core::config::message_layout::MessageLayout;
use crate::features::reminder::types::{ReminderRecord, ReminderType};

/// How long a row is skipped after a failed send.
///
/// Without this a failing row keeps its original trigger time, so it sorts to the front of every
/// batch and crowds out other guilds' reminders.
const RETRY_BACKOFF_SECONDS: i64 = 60;

/// Fetches up to `limit` active reminders that are ready to trigger.
///
/// The message column is read as raw JSON and decoded per row afterwards. Decoding it in the query
/// would let one malformed row fail the whole batch, which starves every other guild.
pub async fn fetch_due_reminders(
    db: &sqlx::PgPool,
    until: DateTime<Utc>,
    limit: i64,
) -> Result<Vec<RawDueReminder>, sqlx::Error> {
    sqlx::query_as!(
        RawDueReminder,
        r#"
        SELECT
            id,
            channel_id,
            message AS "message: Json<serde_json::Value>",
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

/// A due reminder whose message has not been decoded yet.
#[derive(Debug, sqlx::FromRow)]
pub struct RawDueReminder {
    pub id: i64,
    pub channel_id: i64,
    pub r_type: ReminderType,
    pub days_of_week: Option<Vec<i32>>,
    pub time_start: Option<NaiveTime>,
    pub time_end: Option<NaiveTime>,
    pub interval_seconds: Option<i32>,
    pub timezone: Option<String>,
    pub message: Json<serde_json::Value>,
}

impl RawDueReminder {
    /// Decodes the stored layout, returning `None` when the row cannot be rendered.
    #[must_use]
    pub fn message_layout(&self) -> Option<MessageLayout> {
        serde_json::from_value(self.message.0.clone()).ok()
    }

    /// Builds the typed record the worker operates on.
    #[must_use]
    pub fn into_record(self, layout: MessageLayout) -> ReminderRecord {
        ReminderRecord {
            id: self.id,
            channel_id: self.channel_id,
            r_type: self.r_type,
            days_of_week: self.days_of_week,
            time_start: self.time_start,
            time_end: self.time_end,
            interval_seconds: self.interval_seconds,
            timezone: self.timezone,
            message: Json(layout),
        }
    }
}

/// Defers a reminder that could not be delivered, so it stops occupying the front of the queue.
///
/// The row stays active, so a transient outage still delivers once Discord recovers.
pub async fn defer_failed_reminder(
    db: &sqlx::PgPool,
    id: i64,
    now: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    let retry_at = now + Duration::seconds(RETRY_BACKOFF_SECONDS);

    sqlx::query!(
        r#"
        UPDATE reminders
        SET failure_count   = failure_count + 1,
            next_trigger_at = $1
        WHERE id = $2
        "#,
        retry_at,
        id
    )
    .execute(db)
    .await?;

    Ok(())
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
