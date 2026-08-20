use crate::core::config::state::Error;
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
    let _ = buf
        .send(UserUpdate {
            id,
            name: name.to_string(),
        })
        .await;
    Ok(())
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
    tokio::spawn(async move {
        run_username_batch_worker(db, rx).await;
    });
}

/// Continuously drains queued [`UserUpdate`]s and flushes them to Postgres every
/// 5 seconds, or earlier once 500 updates pile up.
pub async fn run_username_batch_worker(db: PgPool, mut rx: mpsc::Receiver<UserUpdate>) {
    let mut ticker = interval(Duration::from_secs(5));
    let mut pending_updates: HashMap<UserId, String> = HashMap::new();

    loop {
        tokio::select! {
            Some(update) = rx.recv() => {
                pending_updates.insert(update.id, update.name);

                // flush early if batch gets too large
                if pending_updates.len() >= 500 {
                    flush_updates(&db, &mut pending_updates).await;
                }
            }
            // Flush whatever we've collected so far
            _ = ticker.tick() => {
                if !pending_updates.is_empty() {
                    flush_updates(&db, &mut pending_updates).await;
                }
            }
        }
    }
}

async fn flush_updates(db: &PgPool, updates: &mut HashMap<UserId, String>) {
    let (ids, names): (Vec<i64>, Vec<String>) = updates
        .drain()
        .map(|(id, name)| (id.get().cast_signed(), name))
        .unzip();

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

    if let Err(e) = result {
        tracing::error!(error = %e, "Failed to flush username batch to DB");
    }
}

/// A pending username update for a Discord user.
pub struct UserUpdate {
    /// ID of the Discord user.
    pub id: UserId,
    /// New username.
    pub name: String,
}
