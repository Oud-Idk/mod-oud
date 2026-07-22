use crate::types::leveling::UserLevel;
use crate::utils::locking::acquire_lock;
use fred::prelude::*;
use fred::types::{Expiration, SetOptions};
use futures_util::StreamExt;
use sqlx::PgPool;
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, error, info, instrument, trace, warn};

pub fn start_level_flush_worker(
    db_pool: PgPool,
    redis_client: Client
) {
    tokio::spawn(async move {
        let lock_key = "lock:level_flush_worker";
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "Starting level flush worker task");

        loop {
            tokio::time::sleep(Duration::from_secs(15)).await;

            trace!("Attempting to acquire lock for level flushing");

            match acquire_lock(&redis_client, lock_key, &lock_value, 3).await {
                Ok(Some(guard)) => {
                    trace!("Lock acquired; starting pending level flush");

                    if let Err(e) = flush_pending_levels(&db_pool, &redis_client).await {
                        error!(error = ?e, "Error flushing levels to database");
                    }

                    match guard.release().await {
                        Ok(true) => trace!("Lock released successfully"),
                        Ok(false) => warn!("Attempted to release lock, but we no longer owned it"),
                        Err(e) => error!(error = ?e, "Failed to release lock due to a Redis error"),
                    }
                }
                Ok(None) => {
                    trace!("Lock already held by another worker; skipping this iteration");
                }
                Err(e) => {
                    error!(error = ?e, "Failed to coordinate Redis lock for level flushing");
                }
            }
        }
    });
}

#[instrument(skip(redis), fields(src = %src, dst = %dst))]
async fn claim_if_exists(
    redis: &Client,
    src: &str,
    dst: &str,
) -> Result<bool, Error> {
    let claimed: i32 = redis
        .eval(
            r#"
                if redis.call("EXISTS", KEYS[1]) == 1 then
                    redis.call("RENAME", KEYS[1], KEYS[2])
                    return 1
                else
                    return 0
                end
            "#,
            vec![src, dst],
            (),
        )
        .await?;

    let success = claimed == 1;
    debug!(claimed = success, "Claim key attempt result");
    Ok(success)
}

#[instrument(skip(redis, db), fields(flushing_key = %flushing_key))]
async fn process_flushing_key(
    flushing_key: &str,
    redis: &Client,
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    debug!("Retrieving records for flushing key");
    let records: HashMap<String, String> = redis.hgetall(flushing_key).await?;

    if records.is_empty() {
        debug!("Flushing key was empty; removing key");
        let _: () = redis.del(flushing_key).await?;
        return Ok(());
    }

    let records_count = records.len();
    debug!(records_count, "Found records to process");

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
                warn!(
                    field = %field,
                    error = ?e,
                    "Failed to deserialize UserLevel from flushing map field"
                );
            }
        }
    }

    if !guild_ids.is_empty() {
        let records_to_upsert = guild_ids.len();
        debug!(records_to_upsert, "Upserting user levels to database");

        sqlx::query!(
            r#"
            INSERT INTO levels (guild_id, user_id, cumulative_xp, current_level, current_xp)
            SELECT * FROM UNNEST($1::bigint[], $2::bigint[], $3::integer[], $4::integer[], $5::integer[])
            ON CONFLICT (guild_id, user_id) DO UPDATE SET
                cumulative_xp = EXCLUDED.cumulative_xp,
                current_level = EXCLUDED.current_level,
                current_xp = EXCLUDED.current_xp;
            "#,
            &guild_ids,
            &user_ids,
            &cumulative_xps,
            &current_levels,
            &current_xps
        )
            .execute(db)
            .await?;

        debug!(records_to_upsert, "Database upsert complete");
    }

    let _: () = redis.del(flushing_key).await?;
    debug!("Successfully deleted flushing key from Redis");

    Ok(())
}

#[instrument(skip(redis, db), fields(guild_id = %guild_id_str))]
async fn flush_guild(
    guild_id_str: &str,
    redis: &Client,
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pending_key = format!("levels:pending:{}", guild_id_str);
    let flushing_key = format!("levels:flushing:{}", guild_id_str);

    let stale_exists: bool = redis.exists(&flushing_key).await?;

    if stale_exists {
        warn!("Found stale flushing key; processing outstanding records");
        process_flushing_key(&flushing_key, redis, db).await?;
    }

    let claimed = claim_if_exists(redis, &pending_key, &flushing_key).await?;

    if claimed {
        debug!("Pending records claimed; processing batch");
        process_flushing_key(&flushing_key, redis, db).await?;
    } else {
        trace!("No pending records to claim");
    }

    let _: () = redis.srem("levels:dirty_guilds", guild_id_str).await?;
    debug!("Guild removed from dirty guilds list");

    Ok(())
}

#[instrument(skip_all)]
async fn flush_pending_levels(
    db: &PgPool,
    redis: &Client
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let dirty_guilds: Vec<String> = redis.smembers("levels:dirty_guilds").await?;

    if dirty_guilds.is_empty() {
        debug!("No dirty guilds found to flush");
        return Ok(());
    }

    let guilds_count = dirty_guilds.len();
    info!(guilds_count, "Flushing levels for dirty guilds");

    let flush_futures = dirty_guilds.into_iter().map(|guild_id_str| {
        let redis_clone = redis.clone();
        let db_pool = db;

        async move {
            if let Err(e) = flush_guild(&guild_id_str, &redis_clone, db_pool).await {
                error!(guild_id = %guild_id_str, error = ?e, "Failed to flush levels for guild");
            }
        }
    });

    futures_util::stream::iter(flush_futures)
        .buffer_unordered(10)
        .collect::<Vec<()>>()
        .await;

    trace!("Finished processing current batch of dirty guilds");
    Ok(())
}