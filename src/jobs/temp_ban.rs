use crate::utils::locking::acquire_lock;
use fred::prelude::*;
use futures_util::StreamExt;
use poise::serenity_prelude as serenity;
use std::sync::Arc;
use tracing::{debug, error, info, instrument, trace, warn};

fn is_unknown_ban_error(err: &serenity::Error) -> bool {
    if let serenity::Error::Http(http_err) = err {
        if let serenity::HttpError::UnsuccessfulRequest(resp) = http_err {
            return resp.error.code == 10026; // 10026 represents "Unknown Ban"
        }
    }
    false
}

pub fn start_temp_ban_worker(
    db_pool: sqlx::PgPool,
    http: Arc<serenity::Http>,
    redis_client: Client,
) {
    tokio::spawn(async move {
        let lock_key = "lock:temp_ban_worker";
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "Starting temp ban worker task");

        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;

            let now = chrono::Utc::now();

            trace!("Attempting to acquire lock for temp ban processing");

            match acquire_lock(&redis_client, lock_key, &lock_value, 3).await {
                Ok(Some(guard)) => {
                    trace!("Acquired lock; processing expired temp bans");
                    if let Err(e) = process_expired_temp_bans(&db_pool, &http, now).await {
                        error!(error = ?e, "Error processing expired temp bans");
                    }

                    // Release using the guard
                    match guard.release().await {
                        Ok(true) => trace!("Released lock successfully"),
                        Ok(false) => warn!("Attempted to release temp ban lock, but we no longer owned it"),
                        Err(e) => error!(error = ?e, "Failed to release temp ban lock due to a Redis error"),
                    }
                }
                Ok(None) => {
                    trace!("Lock busy; skipping this iteration");
                }
                Err(e) => {
                    error!(error = ?e, "Failed to coordinate Redis lock for temp bans");
                }
            }
        }
    });
}

/// Fetch and process expired temp bans.
#[instrument(skip_all)]
async fn process_expired_temp_bans(
    db_pool: &sqlx::PgPool,
    http: &serenity::Http,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), sqlx::Error> {
    let expired_bans = sqlx::query!(
        r#"
        SELECT id, guild_id, user_id FROM temp_bans
        WHERE unban_at <= $1
        LIMIT 200
        "#,
        now
    )
        .fetch_all(db_pool)
        .await?;

    if expired_bans.is_empty() {
        debug!("No expired temp bans to process");
        return Ok(());
    }

    let bans_count = expired_bans.len();
    info!(bans_count, "Found expired temp bans to process");

    let unban_futures = expired_bans.into_iter().map(|record| {
        let http_ref = http;

        async move {
            let guild_id = serenity::GuildId::new(record.guild_id as u64);
            let user_id = serenity::UserId::new(record.user_id as u64);

            match guild_id.unban(http_ref, user_id).await {
                Ok(_) => {
                    debug!(
                        guild_id = %guild_id,
                        user_id = %user_id,
                        ban_id = record.id,
                        "Successfully unbanned user"
                    );
                    Ok(record.id)
                }
                Err(e) => {
                    if is_unknown_ban_error(&e) {
                        debug!(
                            guild_id = %guild_id,
                            user_id = %user_id,
                            ban_id = record.id,
                            "User was already unbanned manually (Unknown Ban error); assuming success"
                        );
                        Ok(record.id)
                    } else {
                        error!(
                            guild_id = %guild_id,
                            user_id = %user_id,
                            ban_id = record.id,
                            error = ?e,
                            "Failed to unban user in guild"
                        );
                        Err(record.id)
                    }
                }
            }
        }
    });

    let results: Vec<Result<i64, i64>> = futures_util::stream::iter(unban_futures)
        .buffer_unordered(10)
        .collect()
        .await;

    let successful_ids: Vec<i64> = results
        .into_iter()
        .filter_map(|r| r.ok())
        .collect();

    let successful_count = successful_ids.len();

    if !successful_ids.is_empty() {
        sqlx::query!(
            "DELETE FROM temp_bans WHERE id = ANY($1)",
            &successful_ids
        )
            .execute(db_pool)
            .await?;

        debug!(successful_count, "Deleted processed bans from the database");
    }

    if successful_count < bans_count {
        warn!(
            failed_count = bans_count - successful_count,
            "Some temp bans failed to process and remain in the database"
        );
    }

    Ok(())
}