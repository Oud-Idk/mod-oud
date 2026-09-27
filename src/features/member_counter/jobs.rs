use crate::core::config::settings::GuildSettings;
use crate::core::config::settings::get_settings;
use crate::features::member_counter::counters::update_guild_counters;
use crate::features::member_counter::database::any_guild_ids_with_member_counters;
use crate::features::member_counter::keys;
use crate::shared::task;
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::types::{Expiration, SetOptions};
use moka::future::Cache;
use serenity::all::{GuildId, Http};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::interval;
use tracing::{info, trace, warn};

/// Starts the member counter background task loop.
pub fn start_member_counter_job(
    http: Arc<Http>,
    serenity_cache: Arc<serenity::all::Cache>,
    db: PgPool,
    redis: Client,
    cache: Cache<GuildId, GuildSettings>,
) {
    task::spawn("member_counter_worker", async move {
        let worker_id = format!("worker-{}", chrono::Utc::now().timestamp_millis());
        info!(worker_id = %worker_id, "member counter worker started");

        let mut timer = interval(Duration::from_mins(1));

        loop {
            timer.tick().await;

            if let Err(e) =
                process_all_member_counters(&http, &serenity_cache, &db, &redis, &cache, &worker_id)
                    .await
            {
                warn!(error = ?e, "member counter processing failed");
            }
        }
    });
}

async fn process_all_member_counters(
    http: &Http,
    serenity_cache: &serenity::all::Cache,
    db: &PgPool,
    redis: &Client,
    cache: &Cache<GuildId, GuildSettings>,
    worker_id: &str,
) -> anyhow::Result<()> {
    // Query database for all guild IDs that have member counter enabled
    let guild_ids = any_guild_ids_with_member_counters(db).await;

    if guild_ids.is_empty() {
        trace!("no active member counters to process");
        return Ok(());
    }

    for guild_id in guild_ids {
        // Fetch guild settings from memory/Redis/DB
        let settings = match get_settings(db, redis, cache, guild_id).await {
            Ok(s) => s,
            Err(e) => {
                warn!(%guild_id, error = ?e, "guild settings lookup failed");
                continue;
            }
        };

        let counter_config = match settings.member_counter {
            Some(ref c) if c.enabled => c,
            _ => continue,
        };

        let interval_secs = u64::from(counter_config.update_interval_minutes.max(5)) * 60;

        // Atomically claim this guild's update slot across every bot instance.
        // The claim is both the distributed lock and the shared schedule:
        // - `SET NX` guarantees exactly one instance wins per interval.
        // - The TTL expires one interval after a successful update.
        // - On failure the claim is deleted so the next tick (on any instance) retries.
        let claim_key = keys::update_claim_key(guild_id);
        let claimed: Option<String> = redis
            .set(
                &claim_key,
                worker_id,
                Some(Expiration::EX(
                    i64::try_from(interval_secs).unwrap_or(i64::MAX),
                )),
                Some(SetOptions::NX),
                false,
            )
            .await?;

        if claimed.is_none() {
            trace!(%guild_id, "update claim held; skipping until interval elapses");
            continue;
        }

        // Process counters for this guild
        if let Err(e) = update_guild_counters(http, serenity_cache, guild_id, counter_config).await
        {
            warn!(%guild_id, error = ?e, "member counter channel update failed");

            if let Err(del_err) = redis.del::<i64, _>(&claim_key).await {
                warn!(
                    %guild_id,
                    error = ?del_err,
                    "member counter claim not released after the failed update"
                );
            }
        }
    }

    Ok(())
}
