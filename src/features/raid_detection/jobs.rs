use crate::features::raid_detection::{cache, database};
use crate::shared::locking::acquire_lock;
use crate::shared::task;
use fred::clients::Client;
use sqlx::PgPool;
use std::time::Duration;
use tracing::{debug, error, info, instrument, trace, warn};

/// Spawns a background worker that periodically flushes accumulated hourly raid join stats
/// from Redis to PostgreSQL. Uses a distributed lock to avoid duplicate writes across instances.
pub fn start_raid_stats_flush_worker(db_pool: PgPool, redis_client: Client) {
    task::spawn("raid_stats_flush_worker", async move {
        let lock_key = "lock:raid_stats_flush_worker";
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "raid stats flush worker started");

        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;

            match acquire_lock(&redis_client, lock_key, &lock_value, 5).await {
                Ok(Some(guard)) => {
                    if let Err(e) = flush_pending_stats(&db_pool, &redis_client).await {
                        warn!(error = ?e, "raid stats flush to database failed");
                    }

                    match guard.release().await {
                        Ok(true) => trace!("lock released"),
                        Ok(false) => warn!(%lock_key, "lock already lost during flush"),
                        Err(e) => warn!(error = ?e, "flush lock release failed"),
                    }
                }
                Ok(None) => {
                    trace!("lock held by another worker; skipping flush");
                }
                Err(e) => {
                    warn!(error = ?e, "flush lock acquire failed");
                }
            }
        }
    });
}

#[instrument(skip_all)]
async fn flush_pending_stats(
    db: &PgPool,
    redis: &Client,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let dirty_guilds = cache::get_dirty_raid_guilds(redis).await?;

    if dirty_guilds.is_empty() {
        trace!("no dirty guilds to flush");
        return Ok(());
    }

    let count = dirty_guilds.len();

    for guild_id in dirty_guilds {
        if let Err(e) = flush_guild(guild_id, redis, db).await {
            error!(%guild_id, error = ?e, "raid stats flush for guild failed");
        }
    }

    debug!(count, "raid stats flushed for dirty guilds");
    Ok(())
}

#[instrument(skip(redis, db), fields(%guild_id))]
async fn flush_guild(
    guild_id: serenity::all::GuildId,
    redis: &Client,
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let records = cache::read_accumulator(redis, guild_id).await?;

    if records.is_empty() {
        debug!("no accumulated records to flush");
        cache::remove_dirty_raid_guild(redis, guild_id).await?;
        return Ok(());
    }

    let count = records.len();

    let hour_keys: Vec<String> = records.keys().cloned().collect();
    let join_counts: Vec<i64> = records.values().copied().collect();
    let guild_ids: Vec<serenity::all::GuildId> = vec![guild_id; hour_keys.len()];

    database::upsert_hourly_stats(db, &guild_ids, &hour_keys, &join_counts).await?;

    // Cleared after the write, not before, so a failed upsert leaves the counts to be retried.
    // The upsert is idempotent, so a clear that fails just costs a repeat.
    cache::clear_accumulator(redis, guild_id).await?;
    cache::remove_dirty_raid_guild(redis, guild_id).await?;
    debug!(count, "flushed hourly stats to database");

    Ok(())
}
