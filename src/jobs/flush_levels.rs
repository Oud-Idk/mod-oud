use crate::events::handlers::levels::levels_text::UserLevel;
use crate::utils::locking;
use redis::aio::MultiplexedConnection;
use sqlx::PgPool;
use std::collections::HashMap;
use std::time::Duration;
use tracing::warn;

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
                eprintln!("Failed to connect to Redis for level flush: {:?}", e);
                return;
            }
        };

        loop {
            tokio::time::sleep(Duration::from_secs(15)).await;

            match locking::acquire_lock(&mut redis_conn, lock_key, &lock_value, 10).await {
                Ok(true) => {
                    if let Err(e) = flush_pending_levels(&db_pool, &mut redis_conn).await { // 👉 Pass conn
                        eprintln!("Error flushing levels to database: {:?}", e);
                    }
                    let _ = locking::release_lock(&mut redis_conn, lock_key, &lock_value).await;
                }
                Ok(false) => {}
                Err(e) => {
                    eprintln!("Failed to coordinate Redis lock for level flushing: {:?}", e);
                }
            }
        }
    });
}


async fn flush_pending_levels(
    db: &PgPool,
    redis_conn: &mut MultiplexedConnection
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let exists: bool = redis::cmd("EXISTS")
        .arg("levels:flushing")
        .query_async(redis_conn)
        .await?;

    if !exists {
        let rename_res: Result<(), redis::RedisError> = redis::cmd("RENAME")
            .arg("levels:pending")
            .arg("levels:flushing")
            .query_async(redis_conn)
            .await;

        match rename_res {
            Ok(_) => {}
            Err(e) => {
                if e.to_string().contains("no such key") {
                    return Ok(());
                }
                return Err(e.into());
            }
        }
    } else {
        warn!("Found stale 'levels:flushing' key from a previous crashed run. Processing first.");
    }

    let records: HashMap<String, String> = redis::cmd("HGETALL")
        .arg("levels:flushing")
        .query_async(redis_conn)
        .await?;

    if records.is_empty() {
        return Ok(());
    }

    // 3. Deserialize records into flat vectors for high-performance PostgreSQL UNNEST
    let mut guild_ids = Vec::with_capacity(records.len());
    let mut user_ids = Vec::with_capacity(records.len());
    let mut cumulative_xps = Vec::with_capacity(records.len());
    let mut current_levels = Vec::with_capacity(records.len());
    let mut current_xps = Vec::with_capacity(records.len());

    for (_, serialized) in records {
        if let Ok(user_level) = serde_json::from_str::<UserLevel>(&serialized) {
            guild_ids.push(user_level.guild_id);
            user_ids.push(user_level.user_id);
            cumulative_xps.push(user_level.cumulative_xp);
            current_levels.push(user_level.current_level);
            current_xps.push(user_level.current_xp);
        }
    }

    sqlx::query!(
        r#"
        INSERT INTO levels (guild_id, user_id, cumulative_xp, current_level, current_xp)
        SELECT * FROM UNNEST($1::text[], $2::text[], $3::integer[], $4::integer[], $5::integer[])
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

    // 5. Clean up the flushing key now that the database has successfully saved
    let _: () = redis::cmd("DEL")
        .arg("levels:flushing")
        .query_async(redis_conn)
        .await?;

    Ok(())
}