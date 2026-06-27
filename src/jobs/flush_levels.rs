use crate::events::handlers::levels::levels_text::UserLevel;
use crate::utils::locking;
use futures_util::StreamExt;
use redis::aio::MultiplexedConnection;
use sqlx::PgPool;
use std::collections::HashMap;
use std::time::Duration;
use tracing::error;

pub fn start_level_flush_worker(
    db_pool: PgPool,
    redis_client: redis::Client
) {
    tokio::spawn(async move {
        let lock_key = "lock:level_flush_worker";
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        let mut redis_conn = match redis_client.get_multiplexed_async_connection().await {
            Ok(conn) => conn,
            Err(e) => {
                error!("Failed to connect to Redis for level flush: {:?}", e);
                return;
            }
        };

        loop {
            tokio::time::sleep(Duration::from_secs(15)).await;

            match locking::acquire_lock(&mut redis_conn, lock_key, &lock_value, 10).await {
                Ok(true) => {
                    if let Err(e) = flush_pending_levels(&db_pool, &mut redis_conn).await {
                        error!("Error flushing levels to database: {:?}", e);
                    }
                    let _ = locking::release_lock(&mut redis_conn, lock_key, &lock_value).await;
                }
                Ok(false) => {}
                Err(e) => {
                    error!("Failed to coordinate Redis lock for level flushing: {:?}", e);
                }
            }
        }
    });
}

async fn claim_if_exists(
    redis_conn: &mut MultiplexedConnection,
    src: &str,
    dst: &str,
) -> Result<bool, redis::RedisError> {
    let script = redis::Script::new(r#"
        if redis.call("EXISTS", KEYS[1]) == 1 then
            redis.call("RENAME", KEYS[1], KEYS[2])
            return 1
        else
            return 0
        end
    "#);

    let claimed: i32 = script
        .key(src)
        .key(dst)
        .invoke_async(redis_conn)
        .await?;

    Ok(claimed == 1)
}

async fn process_flushing_key(
    flushing_key: &str,
    redis_conn: &mut MultiplexedConnection,
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let records: HashMap<String, String> = redis::cmd("HGETALL")
        .arg(flushing_key)
        .query_async(redis_conn)
        .await?;

    if records.is_empty() {
        let _: () = redis::cmd("DEL").arg(flushing_key).query_async(redis_conn).await?;
        return Ok(());
    }

    let mut guild_ids = Vec::with_capacity(records.len());
    let mut user_ids = Vec::with_capacity(records.len());
    let mut usernames = Vec::with_capacity(records.len()); // Added
    let mut cumulative_xps = Vec::with_capacity(records.len());
    let mut current_levels = Vec::with_capacity(records.len());
    let mut current_xps = Vec::with_capacity(records.len());

    for (_, serialized) in records {
        if let Ok(user_level) = serde_json::from_str::<UserLevel>(&serialized) {
            guild_ids.push(user_level.guild_id);
            user_ids.push(user_level.user_id);
            usernames.push(user_level.username); // Added
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
            &usernames, // Added
            &cumulative_xps,
            &current_levels,
            &current_xps
        )
            .execute(db)
            .await?;
    }

    let _: () = redis::cmd("DEL").arg(flushing_key).query_async(redis_conn).await?;

    Ok(())
}

async fn flush_guild(
    guild_id_str: &str,
    redis_conn: &mut MultiplexedConnection,
    db: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pending_key = format!("levels:pending:{}", guild_id_str);
    let flushing_key = format!("levels:flushing:{}", guild_id_str);

    let stale_exists: bool = redis::cmd("EXISTS")
        .arg(&flushing_key)
        .query_async(redis_conn)
        .await?;

    if stale_exists {
        process_flushing_key(&flushing_key, redis_conn, db).await?;
    }

    let claimed = claim_if_exists(redis_conn, &pending_key, &flushing_key).await?;

    if claimed {
        process_flushing_key(&flushing_key, redis_conn, db).await?;
    }

    let _: () = redis::cmd("SREM")
        .arg("levels:dirty_guilds")
        .arg(guild_id_str)
        .query_async(redis_conn)
        .await?;

    Ok(())
}

async fn flush_pending_levels(
    db: &PgPool,
    redis_conn: &mut MultiplexedConnection
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let dirty_guilds: Vec<String> = redis::cmd("SMEMBERS")
        .arg("levels:dirty_guilds")
        .query_async(redis_conn)
        .await?;

    if dirty_guilds.is_empty() {
        return Ok(());
    }

    let flush_futures = dirty_guilds.into_iter().map(|guild_id_str| {
        let mut redis_clone = redis_conn.clone();
        let db_pool = db;

        async move {
            if let Err(e) = flush_guild(&guild_id_str, &mut redis_clone, db_pool).await {
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