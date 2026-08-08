use crate::features::reminder::timings::{RecurrenceRule, calculate_next_trigger};
use crate::shared::embed::Format;
use crate::shared::embed::{DiscordEmbed, MessageGetter, create_basic_embed};
use crate::shared::locking::acquire_lock;
use chrono::{DateTime, NaiveTime, Utc};
use fred::prelude::*;
use futures_util::StreamExt;
use poise::serenity_prelude as serenity;
use std::sync::Arc;
use sqlx::types::Json;
use tracing::{debug, error, info, instrument, trace, warn};
use crate::core::config::settings::MessageLayout;

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Default)]
#[sqlx(type_name = "reminder_type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReminderType {
    #[default]
    Single,
    Recurring,
}

#[derive(Debug, Clone, Default, sqlx::FromRow)]
struct ReminderRecord {
    id: i64,
    channel_id: i64,
    r_type: ReminderType,
    days_of_week: Option<Vec<i32>>,
    time_start: Option<NaiveTime>,
    time_end: Option<NaiveTime>,
    interval_seconds: Option<i32>,
    message: Json<MessageLayout>,
}

pub fn start_reminder_worker(
    db_pool: sqlx::PgPool,
    http: Arc<serenity::Http>,
    redis_client: Client,
) {
    tokio::spawn(async move {
        let lock_key = "lock:reminder_worker";
        let lock_value = format!("worker-{}", Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "Starting reminder worker task");

        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

            let now = Utc::now();

            trace!("Attempting to acquire lock for reminder processing");

            match acquire_lock(&redis_client, lock_key, &lock_value, 2).await {
                Ok(Some(guard)) => {
                    trace!("Acquired lock; processing expired reminders");
                    if let Err(e) = process_expired_reminders(&db_pool, &http, now).await {
                        error!(error = ?e, "Error processing expired reminders");
                    }

                    match guard.release().await {
                        Ok(true) => trace!("Released lock successfully"),
                        Ok(false) => warn!("Attempted to release reminder lock, but we no longer owned it"),
                        Err(e) => error!(error = ?e, "Failed to release reminder lock due to Redis error"),
                    }
                }
                Ok(None) => {
                    trace!("Lock busy; skipping this iteration");
                }
                Err(e) => {
                    error!(error = ?e, "Failed to coordinate Redis lock for reminders");
                }
            }
        }
    });
}

/// Fetch and process due reminders.
#[instrument(skip_all)]
async fn process_expired_reminders(
    db_pool: &sqlx::PgPool,
    http: &serenity::Http,
    now: DateTime<Utc>,
) -> Result<(), crate::Error> {
    let expired_reminders = sqlx::query_as!(
        ReminderRecord,
        r#"
        SELECT id, channel_id, message as "message: Json<MessageLayout>", r_type as "r_type: ReminderType",
               days_of_week, time_start, time_end, interval_seconds
        FROM reminders
        WHERE next_trigger_at <= $1 AND is_active = true
        LIMIT 100
        "#,
        now
    )
        .fetch_all(db_pool)
        .await?;

    if expired_reminders.is_empty() {
        debug!("No expired reminders to process");
        return Ok(());
    }

    let reminders_count = expired_reminders.len();
    info!(reminders_count, "Found expired reminders to process");

    let reminder_futures = expired_reminders.into_iter().map(|record| {
        let http_ref = http;
        let db_ref = db_pool;

        let reminder_id = record.id;
        let channel_id = serenity::ChannelId::new(record.channel_id as u64);

        async move {
            let content_opt = match create_basic_embed(&record.message, |t| t.to_string()) {
                Ok(c) => c,
                Err(e) => {
                    error!(
                        channel_id = %channel_id,
                        reminder_id = reminder_id,
                        error = ?e,
                        "Failed to generate reminder embed"
                    );
                    return Err(reminder_id);
                }
            };

            if let Some(content) = content_opt {
                match channel_id.send_message(http_ref, content).await {
                    Ok(_) => {
                        debug!(reminder_id, "Successfully sent reminder");
                        if let Err(e) = handle_post_execution(db_ref, record).await {
                            error!(error = ?e, reminder_id, "Failed to update reminder state in DB");
                        }
                        Ok(reminder_id)
                    }
                    Err(e) => {
                        error!(error = ?e, reminder_id, "Failed to send reminder");

                        if let Err(db_err) = handle_post_execution(db_ref, record).await {
                            error!(error = ?db_err, reminder_id, "Failed to update state after send failure");
                        }
                        Err(reminder_id)
                    }
                }
            } else {
                debug!(
                    reminder_id = reminder_id,
                    "No content to send (user did not input anything). Updating state..."
                );

                if let Err(e) = handle_post_execution(db_ref, record).await {
                    error!(error = ?e, reminder_id = reminder_id, "Failed to update reminder state in DB");
                }

                Ok(reminder_id)
            }
        }
    });

    let results: Vec<Result<i64, i64>> = futures_util::stream::iter(reminder_futures)
        .buffer_unordered(10)
        .collect()
        .await;

    let successful_count = results.iter().filter(|r| r.is_ok()).count();

    if successful_count < reminders_count {
        warn!(
            failed_count = reminders_count - successful_count,
            "Some reminders failed to send and will be retried on the next iteration"
        );
    }

    Ok(())
}

/// Decides whether to update the next run time or disable the reminder.
async fn handle_post_execution(db: &sqlx::PgPool, record: ReminderRecord) -> Result<(), sqlx::Error> {
    if record.r_type == ReminderType::Recurring {
        let days_u32: Vec<u32> = record.days_of_week
            .unwrap_or_default()
            .into_iter()
            .map(|d| d as u32)
            .collect();

        let rule = RecurrenceRule {
            days_of_week: days_u32,
            time_start: record.time_start,
            time_end: record.time_end,
            interval_seconds: record.interval_seconds.map(|i| i as i64),
        };

        let next_run = calculate_next_trigger(Utc::now(), &rule);

        sqlx::query!(
            "UPDATE reminders SET next_trigger_at = $1 WHERE id = $2",
            next_run,
            record.id
        )
            .execute(db)
            .await?;

        debug!(reminder_id = record.id, ?next_run, "Rescheduled recurring reminder");
    } else {
        sqlx::query!(
            "UPDATE reminders SET is_active = false WHERE id = $1",
            record.id
        )
            .execute(db)
            .await?;

        debug!(reminder_id = record.id, "Deactivated single-run reminder");
    }

    Ok(())
}