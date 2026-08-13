use crate::core::config::settings::GuildSettings;
use crate::core::config::settings::get_settings;
use crate::shared::locking;
use chrono::Duration as ChronoDuration;
use chrono::Utc;
use fred::prelude::*;
use futures_util::future::join_all;
use poise::serenity_prelude as serenity;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, info, instrument, trace, warn};

struct WarnTarget {
    channel_id: i64,
    remaining_minutes: i64,
}

pub fn start_ticket_inactivity_worker(
    pool: sqlx::PgPool,
    http: Arc<serenity::Http>,
    redis_client: Client,
    guild_config: moka::future::Cache<i64, GuildSettings>
) {
    tokio::spawn(async move {
        let lock_key = "lock:ticket_inactivity_worker";
        let lock_value = format!("worker-{}", Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "Starting ticket inactivity worker task");

        loop {
            tokio::time::sleep(Duration::from_mins(1)).await;

            trace!("Attempting to acquire lock for ticket inactivity checks");

            // Set a 3-second heartbeat. The watchdog keeps it alive for both tasks!
            match locking::acquire_lock(&redis_client, lock_key, &lock_value, 3).await {
                Ok(Some(guard)) => {
                    debug!("Acquired lock; running inactivity evaluations");

                    if let Err(e) = warn_inactive_tickets(&pool, &redis_client, &http, &guild_config).await {
                        error!(error = ?e, "Error warning inactive tickets");
                    }

                    if let Err(e) = close_abandoned_tickets(&pool, &redis_client, &http, &guild_config).await {
                        error!(error = ?e, "Error closing abandoned tickets");
                    }

                    // Release using the guard
                    if let Err(e) = guard.release().await {
                        warn!(error = ?e, "Failed to release inactivity lock");
                    } else {
                        debug!("Released inactivity lock successfully");
                    }
                }
                Ok(None) => {
                    trace!("Lock busy; skipping this iteration");
                }
                Err(e) => {
                    error!(error = ?e, "Failed to coordinate Redis lock for ticket inactivity worker");
                }
            }
        }
    });
}

/// Helper to fetch configuration settings for a set of guild IDs in parallel.
#[instrument(skip_all)]
async fn fetch_guild_settings(
    pool: &sqlx::PgPool,
    redis: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    guild_ids: HashSet<i64>,
) -> HashMap<i64, GuildSettings> {
    let guilds_count = guild_ids.len();
    debug!(guilds_count, "Fetching configuration settings for unique guilds");

    let mut settings_futures = Vec::with_capacity(guilds_count);

    for guild_id in guild_ids {
        let pool_clone = pool.clone();
        let redis_clone = redis.clone();
        let cache_clone = guild_configs.clone();

        settings_futures.push(async move {
            let settings = get_settings(&pool_clone, &redis_clone, &cache_clone, guild_id)
                .await
                .unwrap_or_default();
            (guild_id, settings)
        });
    }

    let results: HashMap<i64, GuildSettings> = join_all(settings_futures)
        .await
        .into_iter()
        .collect();

    debug!(fetched_count = results.len(), "Completed fetching guild settings");
    results
}

/// Helper function to warn inactive tickets
#[instrument(skip_all)]
async fn warn_inactive_tickets(
    pool: &sqlx::PgPool,
    redis: &Client,
    http: &serenity::Http,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = Utc::now();
    let safety_threshold = now - ChronoDuration::minutes(1);

    let candidates = sqlx::query!(
        r#"
        SELECT channel_id, guild_id, last_activity
        FROM tickets
        WHERE status = 'OPEN' AND warned = FALSE AND last_activity < $1
        LIMIT 100
        "#,
        safety_threshold
    )
        .fetch_all(pool)
        .await?;

    if candidates.is_empty() {
        debug!("No candidates found for inactivity warning");
        return Ok(());
    }

    let candidates_count = candidates.len();
    debug!(candidates_count, "Evaluating tickets for inactivity warning");

    let unique_guild_ids: HashSet<i64> = candidates.iter().map(|c| c.guild_id).collect();
    let settings_map = fetch_guild_settings(pool, redis, guild_configs, unique_guild_ids).await;

    let mut tickets_to_warn = Vec::new();

    for row in candidates {
        let settings = settings_map.get(&row.guild_id);
        let ticket_config = settings.and_then(|s| s.tickets.as_ref());

        let warn_std = ticket_config
            .map(|t| t.warn_threshold)
            .unwrap_or_else(|| Duration::from_mins(30));
        let delete_std = ticket_config
            .map(|t| t.delete_threshold)
            .unwrap_or_else(|| Duration::from_mins(45));

        let warn_duration = ChronoDuration::from_std(warn_std).unwrap_or(ChronoDuration::minutes(30));
        let delete_duration = ChronoDuration::from_std(delete_std).unwrap_or(ChronoDuration::minutes(45));

        if let Some(last_activity) = row.last_activity
            && last_activity < now - warn_duration {
                let remaining_minutes = (delete_duration - warn_duration).num_minutes();
                tickets_to_warn.push(WarnTarget {
                    channel_id: row.channel_id,
                    remaining_minutes: if remaining_minutes > 0 { remaining_minutes } else { 15 },
                });
            }
    }

    if tickets_to_warn.is_empty() {
        debug!("No tickets qualified for inactivity warning after evaluation");
        return Ok(());
    }

    let warn_count = tickets_to_warn.len();
    info!(warn_count, "Warning inactive tickets");

    let target_ids: Vec<i64> = tickets_to_warn.iter().map(|t| t.channel_id).collect();

    if !target_ids.is_empty() {
        sqlx::query!(
            "UPDATE tickets SET warned = TRUE WHERE channel_id = ANY($1)",
            &target_ids
        )
            .execute(pool)
            .await?;
        debug!(updated_count = target_ids.len(), "Updated tickets to warned status in database");
    }

    // Send warning messages
    for target in tickets_to_warn {
        let channel_id = serenity::ChannelId::new(target.channel_id as u64);
        let message = format!(
            "This ticket has been inactive. It will close in {} minutes if there is no activity.",
            target.remaining_minutes
        );

        match channel_id.say(http, &message).await {
            Ok(_) => {
                debug!(channel_id = %channel_id, "Sent inactivity warning message to channel");
            }
            Err(e) => {
                warn!(
                    channel_id = %channel_id,
                    error = ?e,
                    "Failed to send inactivity warning message to channel"
                );
            }
        }
    }

    Ok(())
}

use serenity::Error as SerenityError;
/// Helper function to close completely abandoned tickets
use serenity::all::HttpError;


/// Helper to check if the error is Discord's "10003 Unknown Channel"
const fn is_unknown_channel_error(err: &SerenityError) -> bool {
    match err {
        SerenityError::Http(HttpError::UnsuccessfulRequest(resp)) => {
            resp.error.code == 10003
        }
        _ => false,
    }
}

/// Helper function to close completely abandoned tickets
#[instrument(skip_all)]
async fn close_abandoned_tickets(
    pool: &sqlx::PgPool,
    redis: &Client,
    http: &serenity::Http,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = Utc::now();
    let safety_threshold = now - ChronoDuration::minutes(1);

    let candidates = sqlx::query!(
        r#"
        SELECT channel_id, guild_id, last_activity
        FROM tickets
        WHERE status = 'OPEN' AND warned = TRUE AND last_activity < $1
        LIMIT 100
        "#,
        safety_threshold
    )
        .fetch_all(pool)
        .await?;

    if candidates.is_empty() {
        debug!("No candidates found for abandoned closure");
        return Ok(());
    }

    let candidates_count = candidates.len();
    debug!(candidates_count, "Evaluating tickets for abandoned closure");

    let unique_guild_ids: HashSet<i64> = candidates.iter().map(|c| c.guild_id).collect();
    let settings_map = fetch_guild_settings(pool, redis, guild_configs, unique_guild_ids).await;

    let mut tickets_to_close = Vec::new();

    for row in candidates {
        let settings = settings_map.get(&row.guild_id);
        let delete_std = settings
            .and_then(|s| s.tickets.as_ref())
            .map(|t| t.delete_threshold)
            .unwrap_or_else(|| Duration::from_mins(45));

        let delete_duration = ChronoDuration::from_std(delete_std).unwrap_or(ChronoDuration::minutes(45));

        if let Some(last_activity) = row.last_activity
            && last_activity < now - delete_duration {
                tickets_to_close.push(row.channel_id);
            }
    }

    if tickets_to_close.is_empty() {
        debug!("No tickets qualified for closure after evaluation");
        return Ok(());
    }

    let close_count = tickets_to_close.len();
    info!(close_count, "Closing abandoned tickets");

    if !tickets_to_close.is_empty() {
        sqlx::query!(
            "UPDATE tickets SET status = 'CLOSED' WHERE channel_id = ANY($1)",
            &tickets_to_close
        )
            .execute(pool)
            .await?;
        debug!(updated_count = tickets_to_close.len(), "Set closed status in database for abandoned tickets");
    }

    for channel_id in tickets_to_close {
        let chan = serenity::ChannelId::new(channel_id as u64);

        match chan.delete(http).await {
            Ok(_) => {
                info!(channel_id = %chan, "Successfully deleted abandoned ticket channel");
            }
            Err(e) => {
                // FIX 2: Gracefully handle manually deleted channels (Error 10003)
                if is_unknown_channel_error(&e) {
                    debug!(
                        channel_id = %chan,
                        "Ticket channel was already deleted from Discord manually"
                    );
                } else {
                    warn!(
                        channel_id = %chan,
                        error = ?e,
                        "Failed to delete inactive ticket channel on close"
                    );
                }
            }
        }
    }

    Ok(())
}