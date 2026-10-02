use crate::features::leveling::types::UserLevel;
use crate::features::leveling::{cache, database, keys};
use crate::shared::locking::acquire_lock;
use crate::shared::task;
use fred::clients::Client;
use futures_util::StreamExt;
use sqlx::PgPool;
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, error, info, instrument, trace, warn};

/// Spawns a background worker that periodically flushes pending user levels from Redis to the database.
pub fn start_level_flush_worker(db_pool: PgPool, redis_client: Client) {
    task::spawn("level_flush_worker", async move {
        let lock_key = "lock:level_flush_worker";
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "level flush worker started");

        loop {
            tokio::time::sleep(Duration::from_secs(15)).await;

            match acquire_lock(&redis_client, lock_key, &lock_value, 3).await {
                Ok(Some(guard)) => {
                    trace!("level flush lock acquired");

                    if let Err(e) = flush_pending_levels(&db_pool, &redis_client).await {
                        warn!(error = ?e, "level flush to database failed");
                    }

                    match guard.release().await {
                        Ok(true) => trace!("level flush lock released"),
                        Ok(false) => {
                            warn!(%lock_key, "level flush lock release skipped, no longer owned");
                        }
                        Err(e) => warn!(error = ?e, "level flush lock release failed"),
                    }
                }
                Ok(None) => {
                    trace!("level flush lock held by another worker; skipping this iteration");
                }
                Err(e) => {
                    warn!(error = ?e, "level flush lock acquisition failed");
                }
            }
        }
    });
}

#[instrument(skip(redis, db), fields(flushing_key = %flushing_key))]
async fn process_flushing_key(
    flushing_key: &str,
    redis: &Client,
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let records: HashMap<String, String> = cache::get_flushing_records(redis, flushing_key).await?;

    if records.is_empty() {
        cache::delete_levels_flush_key(redis, flushing_key).await?;
        debug!("empty flushing key removed from redis");
        return Ok(());
    }

    let records_count = records.len();
    debug!(records_count, "found records to process");

    let mut guild_ids = Vec::with_capacity(records_count);
    let mut user_ids = Vec::with_capacity(records_count);
    let mut cumulative_xps = Vec::with_capacity(records_count);
    let mut current_levels = Vec::with_capacity(records_count);
    let mut current_xps = Vec::with_capacity(records_count);

    for (field, serialized) in records {
        match serde_json::from_str::<UserLevel>(&serialized) {
            Ok(user_level) => {
                guild_ids.push(user_level.guild_id);
                user_ids.push(user_level.user_id);
                cumulative_xps.push(user_level.cumulative_xp);
                current_levels.push(user_level.current_level);
                current_xps.push(user_level.current_xp);
            }
            Err(e) => {
                error!(
                    field = %field,
                    error = ?e,
                    "pending level record deserialization failed"
                );
            }
        }
    }

    if !guild_ids.is_empty() {
        let records_to_upsert = guild_ids.len();
        database::upsert_level(
            db,
            &guild_ids,
            &user_ids,
            &cumulative_xps,
            &current_levels,
            &current_xps,
        )
        .await?;

        debug!(records_to_upsert, "user levels upserted to database");
    }

    cache::delete_levels_flush_key(redis, flushing_key).await?;
    debug!("deleted flushing key from Redis");

    Ok(())
}

#[instrument(skip(redis, db), fields(%guild_id_str))]
async fn flush_guild(
    guild_id_str: &str,
    redis: &Client,
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pending_key = keys::pending_levels_key(guild_id_str);
    let flushing_key = keys::flushing_levels_key(guild_id_str);

    let stale_exists: bool = cache::flushing_key_exists(redis, &flushing_key).await?;

    if stale_exists {
        warn!("stale flushing key found; its records are replayed");
        process_flushing_key(&flushing_key, redis, db).await?;
    }

    let claimed = cache::claim_pending_levels(redis, &pending_key, &flushing_key).await?;

    if claimed {
        debug!("pending records claimed");
        process_flushing_key(&flushing_key, redis, db).await?;
    } else {
        trace!("no pending records to claim");
    }

    cache::remove_dirty_guild(redis, guild_id_str).await?;
    debug!("guild removed from dirty guilds list");

    Ok(())
}

#[instrument(skip_all)]
async fn flush_pending_levels(
    db: &PgPool,
    redis: &Client,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let dirty_guilds: Vec<String> = cache::get_dirty_guilds(redis).await?;

    if dirty_guilds.is_empty() {
        trace!("no dirty guilds found to flush");
        return Ok(());
    }

    let guilds_count = dirty_guilds.len();

    let flush_futures = dirty_guilds.into_iter().map(|guild_id_str| {
        let redis_clone = redis.clone();
        let db_pool = db;

        async move {
            if let Err(e) = flush_guild(&guild_id_str, &redis_clone, db_pool).await {
                warn!(%guild_id_str, error = ?e, "level flush for guild failed");
            }
        }
    });

    futures_util::stream::iter(flush_futures)
        .buffer_unordered(10)
        .collect::<Vec<()>>()
        .await;

    debug!(guilds_count, "dirty guild levels flushed");
    Ok(())
}
