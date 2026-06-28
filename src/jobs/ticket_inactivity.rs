use crate::core::config::get_settings;
use crate::types::config::config::GuildSettings;
use crate::utils::locking;
use chrono::Duration as ChronoDuration;
use chrono::Utc;
use fred::prelude::*;
use futures_util::future::join_all;
use poise::serenity_prelude as serenity;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
// Fred prelude brings in Client and common interfaces

struct WarnTarget {
    channel_id: i64,
    remaining_minutes: i64,
}

pub fn start_ticket_inactivity_worker(
    pool: sqlx::PgPool,
    http: Arc<serenity::Http>,
    redis_client: Client, // Updated to Fred Client
    guild_config: moka::future::Cache<i64, GuildSettings>
) {
    tokio::spawn(async move {
        let lock_key = "lock:ticket_inactivity_worker";
        let lock_value = format!("worker-{}", Utc::now().timestamp_millis());

        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;

            match locking::acquire_lock(&redis_client, lock_key, &lock_value, 50).await {
                Ok(true) => {
                    if let Err(e) = warn_inactive_tickets(&pool, &redis_client, &http, &guild_config).await {
                        eprintln!("Error warning inactive tickets: {:?}", e);
                    }

                    if let Err(e) = close_abandoned_tickets(&pool, &redis_client, &http, &guild_config).await {
                        eprintln!("Error closing abandoned tickets: {:?}", e);
                    }

                    let _ = locking::release_lock(&redis_client, lock_key, &lock_value).await;
                }
                Ok(false) => {}
                Err(e) => {
                    eprintln!("Failed to coordinate Redis lock: {:?}", e);
                }
            }
        }
    });
}

/// Extracted helper to fetch configuration settings for a set of guild IDs in parallel.
async fn fetch_guild_settings(
    pool: &sqlx::PgPool,
    redis: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    guild_ids: HashSet<i64>,
) -> HashMap<i64, GuildSettings> {
    let mut settings_futures = Vec::with_capacity(guild_ids.len());

    for guild_id in guild_ids {
        let pool_clone = pool.clone();
        let redis_clone = redis.clone(); // Incredibly cheap and thread-safe clone!
        let cache_clone = guild_configs.clone();

        settings_futures.push(async move {
            let settings = get_settings(&pool_clone, &redis_clone, &cache_clone, guild_id)
                .await
                .unwrap_or_default();
            (guild_id, settings)
        });
    }

    join_all(settings_futures)
        .await
        .into_iter()
        .collect()
}

/// Helper function to warn inactive tickets
async fn warn_inactive_tickets(
    pool: &sqlx::PgPool,
    redis: &Client, // Updated to Fred Client
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
        return Ok(());
    }

    let unique_guild_ids: HashSet<i64> = candidates.iter().map(|c| c.guild_id).collect();
    let settings_map = fetch_guild_settings(pool, redis, guild_configs, unique_guild_ids).await;

    let mut tickets_to_warn = Vec::new();

    for row in candidates {
        let settings = settings_map.get(&row.guild_id);
        let ticket_config = settings.and_then(|s| s.tickets.as_ref());

        let warn_std = ticket_config
            .map(|t| t.warn_threshold)
            .unwrap_or_else(|| Duration::from_secs(60 * 30));
        let delete_std = ticket_config
            .map(|t| t.delete_threshold)
            .unwrap_or_else(|| Duration::from_secs(60 * 45));

        let warn_duration = ChronoDuration::from_std(warn_std).unwrap_or(ChronoDuration::minutes(30));
        let delete_duration = ChronoDuration::from_std(delete_std).unwrap_or(ChronoDuration::minutes(45));

        if let Some(last_activity) = row.last_activity {
            if last_activity < now - warn_duration {
                let remaining_minutes = (delete_duration - warn_duration).num_minutes();
                tickets_to_warn.push(WarnTarget {
                    channel_id: row.channel_id,
                    remaining_minutes: if remaining_minutes > 0 { remaining_minutes } else { 15 },
                });
            }
        }
    }

    if tickets_to_warn.is_empty() {
        return Ok(());
    }

    let target_ids: Vec<i64> = tickets_to_warn.iter().map(|t| t.channel_id).collect();

    if !target_ids.is_empty() {
        sqlx::query!(
            "UPDATE tickets SET warned = TRUE WHERE channel_id = ANY($1)",
            &target_ids
        )
            .execute(pool)
            .await?;
    }

    // Send warning messages
    for target in tickets_to_warn {
        let channel_id = serenity::ChannelId::new(target.channel_id as u64);
        let message = format!(
            "This ticket has been inactive. It will close in {} minutes if there is no activity.",
            target.remaining_minutes
        );
        let _ = channel_id.say(http, &message).await;
    }

    Ok(())
}

/// Helper function to close completely abandoned tickets
async fn close_abandoned_tickets(
    pool: &sqlx::PgPool,
    redis: &Client, // Updated to Fred Client
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
        return Ok(());
    }

    // Deduplicated parallel configuration fetch!
    let unique_guild_ids: HashSet<i64> = candidates.iter().map(|c| c.guild_id).collect();
    let settings_map = fetch_guild_settings(pool, redis, guild_configs, unique_guild_ids).await;

    let mut tickets_to_close = Vec::new();

    for row in candidates {
        let settings = settings_map.get(&row.guild_id);
        let delete_std = settings
            .and_then(|s| s.tickets.as_ref())
            .map(|t| t.delete_threshold)
            .unwrap_or_else(|| Duration::from_secs(60 * 45));

        let delete_duration = ChronoDuration::from_std(delete_std).unwrap_or(ChronoDuration::minutes(45));

        if let Some(last_activity) = row.last_activity {
            if last_activity < now - delete_duration {
                tickets_to_close.push(row.channel_id);
            }
        }
    }

    if tickets_to_close.is_empty() {
        return Ok(());
    }

    if !tickets_to_close.is_empty() {
        sqlx::query!(
            "UPDATE tickets SET warned = TRUE WHERE channel_id = ANY($1)",
            &tickets_to_close
        )
            .execute(pool)
            .await?;
    }

    for channel_id in tickets_to_close {
        let chan = serenity::ChannelId::new(channel_id as u64);
        let _ = chan.delete(http).await;
    }

    Ok(())
}