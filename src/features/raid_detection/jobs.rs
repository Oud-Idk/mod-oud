use crate::features::raid_detection::{cache, database};
use crate::shared::locking::acquire_lock;
use fred::clients::Client;
use sqlx::PgPool;
use std::time::Duration;
use tracing::{debug, error, info, instrument, trace, warn};

/// Spawns a background worker that periodically flushes accumulated hourly raid join stats
/// from Redis to PostgreSQL. Uses a distributed lock to avoid duplicate writes across instances.
pub fn start_raid_stats_flush_worker(db_pool: PgPool, redis_client: Client) {
    tokio::spawn(async move {
        let lock_key = "lock:raid_stats_flush_worker";
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "Starting raid stats flush worker");

        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;

            match acquire_lock(&redis_client, lock_key, &lock_value, 5).await {
                Ok(Some(guard)) => {
                    trace!("Lock acquired; flushing raid hourly stats");

                    if let Err(e) = flush_pending_stats(&db_pool, &redis_client).await {
                        error!(error = ?e, "Error flushing raid stats to database");
                    }

                    match guard.release().await {
                        Ok(true) => trace!("Lock released successfully"),
                        Ok(false) => warn!("Lock already lost during flush"),
                        Err(e) => error!(error = ?e, "Failed to release flush lock"),
                    }
                }
                Ok(None) => {
                    trace!("Lock held by another worker; skipping flush");
                }
                Err(e) => {
                    error!(error = ?e, "Failed to acquire flush lock");
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
        trace!("No dirty guilds to flush");
        return Ok(());
    }

    let count = dirty_guilds.len();
    info!(count, "Flushing raid stats for dirty guilds");

    for guild_id in dirty_guilds {
        if let Err(e) = flush_guild(guild_id, redis, db).await {
            error!(%guild_id, error = ?e, "Failed to flush raid stats for guild");
        }
    }

    trace!("Finished flushing raid stats batch");
    Ok(())
}

#[instrument(skip(redis, db), fields(%guild_id))]
async fn flush_guild(
    guild_id: serenity::all::GuildId,
    redis: &Client,
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let records = cache::claim_accumulator(redis, guild_id).await?;

    if records.is_empty() {
        debug!("No accumulated records to flush");
        cache::remove_dirty_raid_guild(redis, guild_id).await?;
        return Ok(());
    }

    let count = records.len();
    debug!(count, "Flushing accumulated hourly stats");

    let hour_keys: Vec<String> = records.keys().cloned().collect();
    let join_counts: Vec<i64> = records.values().copied().collect();
    let guild_ids: Vec<serenity::all::GuildId> = vec![guild_id; hour_keys.len()];

    database::upsert_hourly_stats(db, &guild_ids, &hour_keys, &join_counts).await?;

    cache::remove_dirty_raid_guild(redis, guild_id).await?;
    debug!(count, "Successfully flushed hourly stats to database");

    Ok(())
}
