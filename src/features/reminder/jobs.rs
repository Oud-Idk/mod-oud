use crate::features::reminder::database::{
    deactivate_reminder, fetch_due_reminders, update_reminder_next_trigger,
};
use crate::features::reminder::timings::{RecurrenceRule, calculate_next_trigger};
use crate::features::reminder::types::{ReminderRecord, ReminderType};
use crate::shared::embed::create_basic_embed;
use crate::shared::locking::acquire_lock;
use crate::shared::task;
use chrono::{DateTime, Utc};
use fred::prelude::*;
use futures_util::StreamExt;
use poise::serenity_prelude as serenity;
use std::sync::Arc;
use tracing::{debug, error, info, instrument, trace, warn};

/// Spawns a background worker that periodically processes and sends due reminders.
pub fn start_reminder_worker(
    db_pool: sqlx::PgPool,
    http: Arc<serenity::Http>,
    redis_client: Client,
) {
    task::spawn("reminder_worker", async move {
        let lock_key = "lock:reminder_worker";
        let lock_value = format!("worker-{}", Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "reminder worker started");

        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

            let now = Utc::now();
            match acquire_lock(&redis_client, lock_key, &lock_value, 30).await {
                Ok(Some(guard)) => {
                    trace!(%lock_value, "reminder worker lock acquired");
                    if let Err(e) = process_expired_reminders(&db_pool, &http, now).await {
                        warn!(error = ?e, "expired reminder processing failed");
                    }

                    match guard.release().await {
                        Ok(true) => trace!("released lock"),
                        Ok(false) => {
                            warn!(%lock_value, "reminder worker lock no longer held at release");
                        }
                        Err(e) => {
                            warn!(error = ?e, "reminder worker lock not released");
                        }
                    }
                }
                Ok(None) => {
                    trace!("lock busy; skipping this iteration");
                }
                Err(e) => {
                    warn!(error = ?e, "reminder worker lock coordination failed");
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
) -> Result<(), crate::core::config::state::Error> {
    const BATCH_SIZE: i64 = 100;
    const CONCURRENCY_LIMIT: usize = 10;

    let expired_reminders = fetch_due_reminders(db_pool, now, BATCH_SIZE).await?;

    if expired_reminders.is_empty() {
        trace!("no expired reminders to process");
        return Ok(());
    }

    let reminders_count = expired_reminders.len();
    info!(reminders_count, "found expired reminders to process");

    let reminder_futures = expired_reminders.into_iter().map(|record| {
        let http_ref = http;
        let db_ref = db_pool;
        let reminder_id = record.id;
        let channel_id = record.serenity_channel_id();

        async move {
            let content_opt = match create_basic_embed(&record.message, ToString::to_string) {
                Ok(c) => c,
                Err(e) => {
                    warn!(
                        %channel_id,
                        reminder_id,
                        error = ?e,
                        "reminder embed generation failed"
                    );
                    // Invalid template/embed -> advance state so it doesn't choke forever
                    if let Err(e) = handle_post_execution(db_ref, &record).await {
                        error!(error = ?e, reminder_id, "reminder state update failed");
                    }
                    return Err(reminder_id);
                }
            };

            if let Some(content) = content_opt {
                match channel_id.send_message(http_ref, content).await {
                    Ok(_) => {
                        debug!(reminder_id, "sent reminder");
                        if let Err(e) = handle_post_execution(db_ref, &record).await {
                            error!(error = ?e, reminder_id, "reminder state update failed");
                        }
                        Ok(reminder_id)
                    }
                    Err(e) => {
                        warn!(error = ?e, reminder_id, "reminder not sent to discord");
                        // We do NOT update DB here so it can retry on the next tick!
                        Err(reminder_id)
                    }
                }
            } else {
                debug!(
                    reminder_id,
                    "reminder message is empty; the state is still advanced"
                );

                if let Err(e) = handle_post_execution(db_ref, &record).await {
                    error!(error = ?e, reminder_id, "reminder state update failed");
                }

                Ok(reminder_id)
            }
        }
    });

    let results: Vec<Result<i64, i64>> = futures_util::stream::iter(reminder_futures)
        .buffer_unordered(CONCURRENCY_LIMIT)
        .collect()
        .await;

    let successful_count = results.iter().filter(|r| r.is_ok()).count();

    if successful_count < reminders_count {
        warn!(
            failed_count = reminders_count - successful_count,
            "some reminders not sent; they retry on the next tick"
        );
    }

    Ok(())
}

/// Decides whether to update the next run time or disable the reminder.
async fn handle_post_execution(
    db: &sqlx::PgPool,
    record: &ReminderRecord,
) -> Result<(), sqlx::Error> {
    match record.r_type {
        ReminderType::Recurring => {
            let rule = RecurrenceRule {
                days_of_week: record.parsed_days_of_week(),
                time_start: record.time_start,
                time_end: record.time_end,
                interval_seconds: record.interval_seconds.map(i64::from),
                timezone: record.parsed_timezone(),
            };

            let next_run = calculate_next_trigger(Utc::now(), &rule);
            update_reminder_next_trigger(db, record.id, next_run).await?;

            debug!(
                reminder_id = record.id,
                ?next_run,
                "rescheduled recurring reminder"
            );
        }
        ReminderType::Single => {
            deactivate_reminder(db, record.id).await?;
            debug!(reminder_id = record.id, "deactivated single-run reminder");
        }
    }

    Ok(())
}
