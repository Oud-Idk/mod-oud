use crate::types::leveling::UserLevel;
use fred::prelude::*;
use fred::types::{Expiration, SetOptions};
use futures_util::StreamExt;
use sqlx::PgPool;
use std::collections::HashMap;
use std::time::Duration;
use tracing::error;

pub fn start_level_flush_worker(
    db_pool: PgPool,
    redis_client: Client
) {
    tokio::spawn(async move {
        let lock_key = "lock:level_flush_worker";
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        loop {
            tokio::time::sleep(Duration::from_secs(15)).await;

            match acquire_lock(&redis_client, lock_key, &lock_value, 10).await {
                Ok(true) => {
                    if let Err(e) = flush_pending_levels(&db_pool, &redis_client).await {
                        error!("Error flushing levels to database: {:?}", e);
                    }
                    let _ = release_lock(&redis_client, lock_key, &lock_value).await;
                }
                Ok(false) => {}
                Err(e) => {
                    error!("Failed to coordinate Redis lock for level flushing: {:?}", e);
                }
            }
        }
    });
}

async fn acquire_lock(
    redis: &Client,
    lock_key: &str,
    lock_value: &str,
    ttl_secs: i64,
) -> Result<bool, Error> {
    let acquired: Option<String> = redis
        .set(
            lock_key,
            lock_value,
            Some(Expiration::EX(ttl_secs)),
            Some(SetOptions::NX),
            false,
        )
        .await?;
    Ok(acquired.is_some())
}

async fn release_lock(
    redis: &Client,
    lock_key: &str,
    lock_value: &str,
) -> Result<bool, Error> {
    let released: u32 = redis
        .eval(
            r#"
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            "#,
            lock_key,
            lock_value,
        )
        .await?;
    Ok(released == 1)
}

async fn claim_if_exists(
    redis: &Client,
    src: &str,
    dst: &str,
) -> Result<bool, fred::error::Error> {
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

    Ok(claimed == 1)
}

async fn process_flushing_key(
    flushing_key: &str,
    redis: &Client,
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let records: HashMap<String, String> = redis.hgetall(flushing_key).await?;

    if records.is_empty() {
        let _: () = redis.del(flushing_key).await?;
        return Ok(());
    }

    let mut guild_ids = Vec::with_capacity(records.len());
    let mut user_ids = Vec::with_capacity(records.len());
    let mut usernames = Vec::with_capacity(records.len());
    let mut cumulative_xps = Vec::with_capacity(records.len());
    let mut current_levels = Vec::with_capacity(records.len());
    let mut current_xps = Vec::with_capacity(records.len());

    for (_, serialized) in records {
        if let Ok(user_level) = serde_json::from_str::<UserLevel>(&serialized) {
            guild_ids.push(user_level.guild_id);
            user_ids.push(user_level.user_id);
            usernames.push(user_level.username);
            cumulative_xps.push(user_level.cumulative_xp);
            current_levels.push(user_level.current_level);
            current_xps.push(user_level.current_xp);
        }
    }

    if !guild_ids.is_empty() {
        sqlx::query!(
            r#"
            INSERT INTO levels (guild_id, user_id, username, cumulative_xp, current_level, current_xp)
            SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::integer[], $5::integer[], $6::integer[])
            ON CONFLICT (guild_id, user_id) DO UPDATE SET
                username = EXCLUDED.username,
                cumulative_xp = EXCLUDED.cumulative_xp,
                current_level = EXCLUDED.current_level,
                current_xp = EXCLUDED.current_xp;
            "#,
            &guild_ids,
            &user_ids,
            &usernames,
            &cumulative_xps,
            &current_levels,
            &current_xps
        )
            .execute(db)
            .await?;
    }

    let _: () = redis.del(flushing_key).await?;

    Ok(())
}

async fn flush_guild(
    guild_id_str: &str,
    redis: &Client,
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pending_key = format!("levels:pending:{}", guild_id_str);
    let flushing_key = format!("levels:flushing:{}", guild_id_str);

    let stale_exists: bool = redis.exists(&flushing_key).await?;

    if stale_exists {
        process_flushing_key(&flushing_key, redis, db).await?;
    }

    let claimed = claim_if_exists(redis, &pending_key, &flushing_key).await?;

    if claimed {
        process_flushing_key(&flushing_key, redis, db).await?;
    }

    let _: () = redis.srem("levels:dirty_guilds", guild_id_str).await?;

    Ok(())
}

async fn flush_pending_levels(
    db: &PgPool,
    redis: &Client
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let dirty_guilds: Vec<String> = redis.smembers("levels:dirty_guilds").await?;

    if dirty_guilds.is_empty() {
        return Ok(());
    }

    let flush_futures = dirty_guilds.into_iter().map(|guild_id_str| {
        let redis_clone = redis.clone();
        let db_pool = db;

        async move {
            if let Err(e) = flush_guild(&guild_id_str, &redis_clone, db_pool).await {
                error!("Error flushing levels for guild {}: {:?}", guild_id_str, e);
            }
        }
    });

    futures_util::stream::iter(flush_futures)
        .buffer_unordered(10)
        .collect::<Vec<()>>()
        .await;

    Ok(())
}