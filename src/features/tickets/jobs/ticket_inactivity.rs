use crate::core::config::settings::GuildSettings;
use crate::core::config::settings::get_settings;
use crate::features::tickets::database;
use crate::features::tickets::keys;
use crate::shared::locking;
use anyhow::Result;
use chrono::Duration as ChronoDuration;
use chrono::Utc;
use fred::prelude::*;
use futures_util::future::join_all;
use moka::future::Cache;
use poise::serenity_prelude as serenity;
use serenity::Error as SerenityError;
use serenity::all::{ChannelId, GuildId, HttpError};
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, info, instrument, trace, warn};

struct WarnTarget {
    channel_id: ChannelId,
    remaining_minutes: i64,
}

/// Starts the periodic background worker that warns inactive tickets and closes abandoned ones.
pub fn start_ticket_inactivity_worker(
    pool: sqlx::PgPool,
    http: Arc<serenity::Http>,
    redis_client: Client,
    guild_config: Cache<GuildId, GuildSettings>,
) {
    tokio::spawn(async move {
        let lock_key = keys::ticket_inactivity_lock_key();
        let lock_value = format!("worker-{}", Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "Starting ticket inactivity worker task");

        loop {
            tokio::time::sleep(Duration::from_mins(1)).await;

            trace!("Attempting to acquire lock for ticket inactivity checks");

            match locking::acquire_lock(&redis_client, lock_key, &lock_value, 3).await {
                Ok(Some(guard)) => {
                    trace!("Acquired lock; running inactivity evaluations");

                    if let Err(e) =
                        warn_inactive_tickets(&pool, &redis_client, &http, &guild_config).await
                    {
                        error!(error = ?e, "Error warning inactive tickets");
                    }

                    if let Err(e) =
                        close_abandoned_tickets(&pool, &redis_client, &http, &guild_config).await
                    {
                        error!(error = ?e, "Error closing abandoned tickets");
                    }

                    // Release using the guard
                    if let Err(e) = guard.release().await {
                        warn!(error = ?e, "Failed to release inactivity lock");
                    } else {
                        trace!("Released inactivity lock successfully");
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
    pool: &PgPool,
    redis: &Client,
    guild_configs: &Cache<GuildId, GuildSettings>,
    guild_ids: HashSet<GuildId>,
) -> HashMap<GuildId, GuildSettings> {
    let guilds_count = guild_ids.len();
    debug!(
        guilds_count,
        "Fetching configuration settings for unique guilds"
    );

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

    let results: HashMap<GuildId, GuildSettings> =
        join_all(settings_futures).await.into_iter().collect();

    debug!(
        fetched_count = results.len(),
        "Completed fetching guild settings"
    );
    results
}

/// Helper function to warn inactive tickets
#[instrument(skip_all)]
async fn warn_inactive_tickets(
    pool: &PgPool,
    redis: &Client,
    http: &serenity::Http,
    guild_configs: &Cache<GuildId, GuildSettings>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = Utc::now();
    let safety_threshold = now - ChronoDuration::minutes(1);

    let candidates = database::fetch_inactive_tickets(pool, safety_threshold).await?;

    if candidates.is_empty() {
        trace!("No candidates found for inactivity warning");
        return Ok(());
    }

    let candidates_count = candidates.len();
    debug!(
        candidates_count,
        "Evaluating tickets for inactivity warning"
    );

    let unique_guild_ids: HashSet<GuildId> = candidates.iter().map(|c| c.guild_id).collect();
    let settings_map = fetch_guild_settings(pool, redis, guild_configs, unique_guild_ids).await;

    let mut tickets_to_warn = Vec::new();

    for row in candidates {
        let settings = settings_map.get(&row.guild_id);
        let ticket_config = settings.and_then(|s| s.tickets.as_ref());

        let warn_std = ticket_config.map_or_else(|| Duration::from_mins(30), |t| t.warn_threshold);
        let delete_std =
            ticket_config.map_or_else(|| Duration::from_mins(45), |t| t.delete_threshold);

        let warn_duration =
            ChronoDuration::from_std(warn_std).unwrap_or(ChronoDuration::minutes(30));
        let delete_duration =
            ChronoDuration::from_std(delete_std).unwrap_or(ChronoDuration::minutes(45));

        if let Some(last_activity) = row.last_activity
            && last_activity < now - warn_duration
        {
            let remaining_minutes = (delete_duration - warn_duration).num_minutes();
            tickets_to_warn.push(WarnTarget {
                channel_id: row.channel_id,
                remaining_minutes: if remaining_minutes > 0 {
                    remaining_minutes
                } else {
                    15
                },
            });
        }
    }

    if tickets_to_warn.is_empty() {
        debug!("No tickets qualified for inactivity warning after evaluation");
        return Ok(());
    }

    let warn_count = tickets_to_warn.len();
    info!(warn_count, "Warning inactive tickets");

    let target_ids: Vec<ChannelId> = tickets_to_warn.iter().map(|t| t.channel_id).collect();

    if !target_ids.is_empty() {
        database::mark_ticket_as_warned(pool, &target_ids).await?;
        debug!(
            updated_count = target_ids.len(),
            "Updated tickets to warned status in database"
        );
    }

    // Send warning messages
    for target in tickets_to_warn {
        let message = format!(
            "This ticket has been inactive. It will close in {} minutes if there is no activity.",
            target.remaining_minutes
        );

        match target.channel_id.say(http, &message).await {
            Ok(_) => {
                debug!(channel_id = %target.channel_id, "Sent inactivity warning message to channel");
            }
            Err(e) => {
                warn!(
                    channel_id = %target.channel_id,
                    error = ?e,
                    "Failed to send inactivity warning message to channel"
                );
            }
        }
    }

    Ok(())
}

/// Helper to check if the error is Discord's "10003 Unknown Channel"
const fn is_unknown_channel_error(err: &SerenityError) -> bool {
    match err {
        SerenityError::Http(HttpError::UnsuccessfulRequest(resp)) => resp.error.code == 10003,
        _ => false,
    }
}

/// Helper function to close completely abandoned tickets
#[instrument(skip_all)]
async fn close_abandoned_tickets(
    pool: &PgPool,
    redis: &Client,
    http: &serenity::Http,
    guild_configs: &Cache<GuildId, GuildSettings>,
) -> Result<()> {
    let now = Utc::now();
    let safety_threshold = now - ChronoDuration::minutes(1);

    let candidates = database::fetch_closing_candidates(pool, safety_threshold).await?;

    if candidates.is_empty() {
        trace!("No candidates found for abandoned closure");
        return Ok(());
    }

    let candidates_count = candidates.len();
    debug!(candidates_count, "Evaluating tickets for abandoned closure");

    let unique_guild_ids: HashSet<GuildId> = candidates.iter().map(|c| c.guild_id).collect();
    let settings_map = fetch_guild_settings(pool, redis, guild_configs, unique_guild_ids).await;

    let mut tickets_to_close = Vec::new();

    for row in candidates {
        let settings = settings_map.get(&row.guild_id);
        let delete_std = settings
            .and_then(|s| s.tickets.as_ref())
            .map_or_else(|| Duration::from_mins(45), |t| t.delete_threshold);

        let delete_duration =
            ChronoDuration::from_std(delete_std).unwrap_or(ChronoDuration::minutes(45));

        if let Some(last_activity) = row.last_activity
            && last_activity < now - delete_duration
        {
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
        database::mark_ticket_as_closed(pool, &tickets_to_close).await?;
        debug!(
            updated_count = tickets_to_close.len(),
            "Set closed status in database for abandoned tickets"
        );
    }

    for channel_id in tickets_to_close {
        match channel_id.delete(http).await {
            Ok(_) => {
                info!(%channel_id, "Successfully deleted abandoned ticket channel");
            }
            Err(e) => {
                // FIX 2: Gracefully handle manually deleted channels (Error 10003)
                if is_unknown_channel_error(&e) {
                    debug!(
                        %channel_id,
                        "Ticket channel was already deleted from Discord manually"
                    );
                } else {
                    warn!(
                        %channel_id,
                        error = ?e,
                        "Failed to delete inactive ticket channel on close"
                    );
                }
            }
        }
    }

    Ok(())
}
