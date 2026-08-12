use crate::shared::locking::acquire_lock;
use anyhow::Result;
use fred::clients::Client;
use serenity::all::GuildId;
use songbird::input::AuxMetadata;
use sqlx::PgPool;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{error, trace, warn};
use uuid::Uuid;

/// How long play events are kept before being pruned (rolling window).
const STATS_RETENTION: &str = "12 months";

/// Start rows never backfilled (e.g. after a crash) are treated as fully-listened
/// once they're old enough to be considered abandoned.
const BACKFILL_WINDOW: &str = "24 hours";

/// Max events buffered before a flush is forced (even if the interval hasn't ticked).
const FLUSH_BATCH: usize = 64;

/// How often buffered events are flushed to Postgres.
const FLUSH_INTERVAL: Duration = Duration::from_secs(1);

/// An event describing one side of a playback lifecycle. Recording is fully
/// non-blocking: the actor just pushes events onto the channel and the worker
/// drains them in order and batch-writes to the database.
pub enum StatsEvent {
    Start {
        guild_id: i64,
        user_id: i64,
        handle_uuid: String,
        track_url: Option<String>,
        title: String,
        artist: String,
        duration_ms: Option<i64>,
    },
    End {
        handle_uuid: String,
        listened_ms: i64,
    },
}

pub type StatsTx = mpsc::UnboundedSender<StatsEvent>;

/// Non-blocking: enqueues a "track started" event. The start and its matching end
/// share the track's `handle_uuid`, which the worker uses to backfill listened time.
pub fn record_track_start(
    tx: &StatsTx,
    guild_id: GuildId,
    requested_by_id: u64,
    handle_uuid: Uuid,
    metadata: &AuxMetadata,
) {
    let title = metadata.title.clone().unwrap_or_else(|| "Unknown".to_string());
    let artist = metadata.artist.clone().unwrap_or_else(|| "Unknown".to_string());
    let track_url = metadata.source_url.clone();
    let duration_ms = metadata.duration.map(|d| d.as_millis() as i64);

    let _ = tx.send(StatsEvent::Start {
        guild_id: guild_id.get() as i64,
        user_id: requested_by_id as i64,
        handle_uuid: handle_uuid.to_string(),
        track_url,
        title,
        artist,
        duration_ms,
    });
}

/// Non-blocking: enqueues a "track ended" event to backfill `listened_ms`.
pub fn record_track_end(tx: &StatsTx, handle_uuid: Uuid, listened_ms: i64) {
    let _ = tx.send(StatsEvent::End {
        handle_uuid: handle_uuid.to_string(),
        listened_ms,
    });
}

/// Drains the stats channel and batch-writes events to Postgres, decoupling
/// playback from database latency. Runs in every bot process; writes are
/// append-only so processes never contend on the same rows.
pub fn start_music_stats_worker(db: PgPool, mut rx: mpsc::UnboundedReceiver<StatsEvent>) {
    tokio::spawn(async move {
        let mut buffer: Vec<StatsEvent> = Vec::with_capacity(FLUSH_BATCH);
        let mut interval = tokio::time::interval(FLUSH_INTERVAL);

        loop {
            tokio::select! {
                ev = rx.recv() => {
                    match ev {
                        Some(event) => {
                            buffer.push(event);
                            if buffer.len() >= FLUSH_BATCH {
                                flush_batch(&db, &mut buffer).await;
                            }
                        }
                        None => break,
                    }
                }
                _ = interval.tick() => {
                    if !buffer.is_empty() {
                        flush_batch(&db, &mut buffer).await;
                    }
                }
            }
        }

        if !buffer.is_empty() {
            flush_batch(&db, &mut buffer).await;
        }
    });
}

/// Writes a batch of events in a single transaction. On failure everything is
/// requeued so the next flush retries.
async fn flush_batch(db: &PgPool, buffer: &mut Vec<StatsEvent>) {
    let mut events = std::mem::take(buffer);

    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            warn!(error = ?e, "Failed to begin music stats batch; requeueing");
            *buffer = events;
            return;
        }
    };

    let mut ok = true;
    for event in &events {
        let result = match event {
            StatsEvent::Start {
                guild_id,
                user_id,
                handle_uuid,
                track_url,
                title,
                artist,
                duration_ms,
            } => sqlx::query!(
                r#"
                INSERT INTO music_play_events
                    (guild_id, user_id, track_url, title, artist, duration_ms, handle_uuid)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                "#,
                guild_id,
                user_id,
                track_url.as_deref(),
                title,
                artist,
                duration_ms.as_ref().copied(),
                handle_uuid,
            )
                .execute(&mut *tx)
                .await
                .map(|_| ()),
            StatsEvent::End {
                handle_uuid,
                listened_ms,
            } => sqlx::query!(
                r#"
                UPDATE music_play_events
                SET listened_ms = $1
                WHERE handle_uuid = $2 AND listened_ms IS NULL
                "#,
                listened_ms,
                handle_uuid,
            )
                .execute(&mut *tx)
                .await
                .map(|_| ()),
        };

        if let Err(e) = result {
            warn!(error = ?e, "Failed to write music stats event; requeueing batch");
            ok = false;
            break;
        }
    }

    if ok {
        if let Err(e) = tx.commit().await {
            warn!(error = ?e, "Failed to commit music stats batch; requeueing");
            *buffer = events;
        }
    } else {
        drop(tx);
        *buffer = events;
    }
}

/// Periodically prunes play events older than the rolling retention window.
/// Uses a Redis lock so only one bot process performs the prune at a time.
pub fn start_music_stats_prune_worker(db: PgPool, redis_client: Client) {
    tokio::spawn(async move {
        let lock_key = "lock:music_stats_prune_worker";
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        loop {
            tokio::time::sleep(Duration::from_secs(3600)).await;

            match acquire_lock(&redis_client, lock_key, &lock_value, 3).await {
                Ok(Some(guard)) => {
                    trace!("Music stats prune lock acquired; pruning old play events");
                    if let Err(e) = prune_play_events(&db).await {
                        error!(error = ?e, "Error pruning old music play events");
                    }
                    match guard.release().await {
                        Ok(true) => trace!("Music stats prune lock released successfully"),
                        Ok(false) => warn!("Attempted to release music stats prune lock, but we no longer owned it"),
                        Err(e) => error!(error = ?e, "Failed to release music stats prune lock due to a Redis error"),
                    }
                }
                Ok(None) => {
                    trace!("Music stats prune lock already held by another worker; skipping");
                }
                Err(e) => {
                    error!(error = ?e, "Failed to coordinate music stats prune lock");
                }
            }
        }
    });
}

async fn prune_play_events(db: &PgPool) -> Result<()> {
    sqlx::query!(
        r#"
        UPDATE music_play_events
        SET listened_ms = COALESCE(listened_ms, COALESCE(duration_ms, 0))
        WHERE listened_ms IS NULL
          AND played_at < NOW() - ($1::text)::interval
        "#,
        BACKFILL_WINDOW,
    )
        .execute(db)
        .await?;

    sqlx::query!(
        r#"
        DELETE FROM music_play_events
        WHERE played_at < NOW() - ($1::text)::interval
        "#,
        STATS_RETENTION,
    )
        .execute(db)
        .await?;

    Ok(())
}