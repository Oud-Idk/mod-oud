use crate::core::config::get_settings;
use crate::utils::locking;
use chrono::Duration as ChronoDuration;
use chrono::Utc;
use poise::serenity_prelude as serenity;
use std::sync::Arc;
use std::time::Duration;

struct WarnTarget {
    channel_id: i64,
    remaining_minutes: i64,
}

pub fn start_ticket_inactivity_worker(
    pool: sqlx::PgPool,
    http: Arc<serenity::Http>,
    redis_client: redis::Client,
) {
    tokio::spawn(async move {
        let lock_key = "lock:ticket_inactivity_worker";
        let lock_value = format!("worker-{}", Utc::now().timestamp_millis());

        let redis_conn = match redis_client.get_multiplexed_async_connection().await {
            Ok(conn) => conn,
            Err(e) => {
                eprintln!("Failed to initialize Redis connection for worker: {:?}", e);
                return;
            }
        };

        loop {
            // Increased interval to 60 seconds to match realistic inactivity requirements
            tokio::time::sleep(Duration::from_secs(60)).await;

            // Increased lock duration to 50 seconds to cover network latency safely
            match locking::acquire_lock(&redis_client, lock_key, &lock_value, 50).await {
                Ok(true) => {
                    if let Err(e) = warn_inactive_tickets(&pool, &redis_conn, &http).await {
                        eprintln!("Error warning inactive tickets: {:?}", e);
                    }

                    if let Err(e) = close_abandoned_tickets(&pool, &redis_conn, &http).await {
                        eprintln!("Error closing abandoned tickets: {:?}", e);
                    }

                    let _ = locking::release_lock(&redis_client, lock_key, &lock_value).await;
                }
                Ok(false) => {}
                Err(e) => {
                    eprintln!("Failed to coordinate Redis lock: {:?}", e);
                }
            }
        }
    });
}

/// Helper function to warn inactive tickets
async fn warn_inactive_tickets(
    pool: &sqlx::PgPool,
    redis: &redis::aio::MultiplexedConnection,
    http: &serenity::Http,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = Utc::now();

    // Ignore tickets with activity in the last minute to reduce unnecessary lookups
    let safety_threshold = now - ChronoDuration::minutes(1);

    // Fetch candidate tickets
    let candidates = sqlx::query!(
        r#"
        SELECT channel_id, guild_id, last_activity
        FROM tickets
        WHERE status = 'OPEN' AND warned = FALSE AND last_activity < $1
        LIMIT 100
        "#,
        safety_threshold
    )
        .fetch_all(pool)
        .await?;

    if candidates.is_empty() {
        return Ok(());
    }

    let mut tickets_to_warn = Vec::new();

    for row in candidates {
        // Retrieve settings for the ticket's guild
        let settings = get_settings(pool, redis, row.guild_id)
            .await
            .unwrap_or_default();

        let ticket_config = settings.tickets.as_ref();

        let warn_std = ticket_config
            .map(|t| t.warn_threshold)
            .unwrap_or_else(|| Duration::from_secs(60 * 30));
        let delete_std = ticket_config
            .map(|t| t.delete_threshold)
            .unwrap_or_else(|| Duration::from_secs(60 * 45));

        let warn_duration = ChronoDuration::from_std(warn_std).unwrap_or(ChronoDuration::minutes(30));
        let delete_duration = ChronoDuration::from_std(delete_std).unwrap_or(ChronoDuration::minutes(45));

        // Use if let Some to handle the Option type safely
        if let Some(last_activity) = row.last_activity {
            if last_activity < now - warn_duration {
                let remaining_minutes = (delete_duration - warn_duration).num_minutes();
                tickets_to_warn.push(WarnTarget {
                    channel_id: row.channel_id,
                    remaining_minutes: if remaining_minutes > 0 { remaining_minutes } else { 15 },
                });
            }
        }
    }

    if tickets_to_warn.is_empty() {
        return Ok(());
    }

    // Update DB
    let mut tx = pool.begin().await?;
    for target in &tickets_to_warn {
        sqlx::query!(
            "UPDATE tickets SET warned = TRUE WHERE channel_id = $1",
            target.channel_id
        )
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    // Send warning messages
    for target in tickets_to_warn {
        let channel_id = serenity::ChannelId::new(target.channel_id as u64);
        let message = format!(
            "This ticket has been inactive. It will close in {} minutes if there is no activity.",
            target.remaining_minutes
        );
        let _ = channel_id.say(http, &message).await;
    }

    Ok(())
}

/// Helper function to close completely abandoned tickets
async fn close_abandoned_tickets(
    pool: &sqlx::PgPool,
    redis: &redis::aio::MultiplexedConnection,
    http: &serenity::Http,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = Utc::now();
    let safety_threshold = now - ChronoDuration::minutes(1);

    let candidates = sqlx::query!(
        r#"
        SELECT channel_id, guild_id, last_activity
        FROM tickets
        WHERE status = 'OPEN' AND warned = TRUE AND last_activity < $1
        LIMIT 100
        "#,
        safety_threshold
    )
        .fetch_all(pool)
        .await?;

    if candidates.is_empty() {
        return Ok(());
    }

    let mut tickets_to_close = Vec::new();

    for row in candidates {
        let settings = get_settings(pool, redis, row.guild_id)
            .await
            .unwrap_or_default();

        let delete_std = settings.tickets.as_ref()
            .map(|t| t.delete_threshold)
            .unwrap_or_else(|| Duration::from_secs(60 * 45));

        let delete_duration = ChronoDuration::from_std(delete_std).unwrap_or(ChronoDuration::minutes(45));

        if let Some(last_activity) = row.last_activity {
            if last_activity < now - delete_duration {
                tickets_to_close.push(row.channel_id);
            }
        }
    }

    if tickets_to_close.is_empty() {
        return Ok(());
    }

    // Update DB
    let mut tx = pool.begin().await?;
    for channel_id in &tickets_to_close {
        sqlx::query!(
            "UPDATE tickets SET status = 'CLOSE', closed_at = CURRENT_TIMESTAMP WHERE channel_id = $1",
            channel_id
        )
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    // Delete Discord channels
    for channel_id in tickets_to_close {
        let chan = serenity::ChannelId::new(channel_id as u64);
        let _ = chan.delete(http).await;
    }

    Ok(())
}
