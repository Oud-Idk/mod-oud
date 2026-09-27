use crate::core::config::state::Error;
use crate::shared::task;
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::prelude::Expiration;
use serenity::model::id::UserId;
use sqlx::PgPool;
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::interval;

/// Stores or updates the username relation in both Postgres and Redis.
///
/// # Errors
/// Returns an error if the username update cannot be queued to the batch worker.
pub async fn store_username_relation(
    buf: &tokio::sync::mpsc::Sender<UserUpdate>,
    id: UserId,
    name: &str,
) -> anyhow::Result<()> {
    // Queuing is best-effort: a dropped update only means a later lookup falls
    // back to Postgres. The previous `let _ =` made this function incapable of
    // ever returning `Err`, so every `?` at the call sites was dead code.
    buf.send(UserUpdate {
        id,
        name: name.to_string(),
    })
    .await
    .inspect_err(|e| {
        tracing::warn!(error = ?e, user_id = %id, "username update channel closed; update dropped");
    })
    .map_err(|e| anyhow::anyhow!("username update queueing failed: {e}"))
}

/// Fetches a username, checking Redis first, then Postgres.
///
/// # Errors
/// Returns an error if the Redis or Postgres lookup fails.
pub async fn get_username(
    db: &PgPool,
    redis: &Client,
    id: UserId,
) -> anyhow::Result<Option<String>, Error> {
    let redis_key = format!("username:{id}");

    if let Ok(cached_name) = redis.get::<String, &str>(&redis_key).await {
        return Ok(Some(cached_name));
    }

    let db_record = sqlx::query!(
        "SELECT username FROM discord_users WHERE user_id = $1",
        id.get().cast_signed()
    )
    .fetch_optional(db)
    .await?;

    if let Some(record) = db_record {
        redis
            .set::<(), &str, &str>(
                &redis_key,
                &record.username,
                Some(Expiration::EX(86400)),
                None,
                false,
            )
            .await?;

        return Ok(Some(record.username));
    }

    Ok(None)
}

/// Queues a username update to be written to Postgres in batches.
pub fn start_username_batch_worker(db: PgPool, rx: mpsc::Receiver<UserUpdate>) {
    task::spawn("username_batch_worker", async move {
        run_username_batch_worker(db, rx).await;
    });
}

/// Continuously drains queued [`UserUpdate`]s and flushes them to Postgres every
/// 5 seconds, or earlier once 500 updates pile up.
pub async fn run_username_batch_worker(db: PgPool, mut rx: mpsc::Receiver<UserUpdate>) {
    let mut ticker = interval(Duration::from_secs(5));
    let mut pending_updates: HashMap<UserId, String> = HashMap::new();
    let mut flush_failed = false;

    loop {
        tokio::select! {
            Some(update) = rx.recv() => {
                pending_updates.insert(update.id, update.name);

                // A failed batch leaves the map large, so without this gate every incoming update
                // would attempt another write until Postgres returned. The ticker retries.
                if pending_updates.len() >= 500 && !flush_failed {
                    flush_failed = flush_updates(&db, &mut pending_updates).await;
                }
            }
            // Flush whatever we've collected so far
            _ = ticker.tick() => {
                if !pending_updates.is_empty() {
                    flush_failed = flush_updates(&db, &mut pending_updates).await;
                }
            }
        }
    }
}

/// Writes the batch and clears it only once it is durable. Returns true when the write failed, so
/// the caller knows the map is still holding it.
async fn flush_updates(db: &PgPool, updates: &mut HashMap<UserId, String>) -> bool {
    // Read without draining: the batch is cleared only once it is in the database, so a failure
    // leaves it for the next tick instead of losing the names outright.
    let ids: Vec<i64> = updates.keys().map(|id| id.get().cast_signed()).collect();
    let names: Vec<String> = updates.values().cloned().collect();

    let result = sqlx::query!(
        "INSERT INTO discord_users (user_id, username, updated_at) \
         SELECT * FROM UNNEST($1::bigint[], $2::text[]), NOW() \
         ON CONFLICT (user_id) \
         DO UPDATE SET username = EXCLUDED.username, updated_at = NOW()",
        &ids[..],
        &names[..]
    )
    .execute(db)
    .await;

    match result {
        Ok(_) => {
            updates.clear();
            false
        }
        Err(e) => {
            tracing::error!(
                error = %e,
                pending = updates.len(),
                "username batch flush to db failed; the batch is retried"
            );
            true
        }
    }
}

/// A pending username update for a Discord user.
pub struct UserUpdate {
    /// ID of the Discord user.
    pub id: UserId,
    /// New username.
    pub name: String,
}
