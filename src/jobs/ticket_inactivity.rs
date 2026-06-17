use crate::utils::locking;
use chrono::{DateTime, Utc};
use poise::serenity_prelude as serenity;
use std::sync::Arc;
use std::time::Duration;

pub fn start_ticket_inactivity_worker(
    pool: sqlx::PgPool,
    http: Arc<serenity::Http>,
    redis_client: redis::Client
) {
    tokio::spawn(async move {
        let lock_key = "lock:ticket_inactivity_worker";
        let lock_value = format!("worker-{}", Utc::now().timestamp_millis());

        loop {
            // Checks every 5 seconds
            tokio::time::sleep(Duration::from_secs(5)).await;

            let now = Utc::now();
            let warn_threshold = now - Duration::from_secs(60 * 30); // 30 minutes
            let close_threshold = now - Duration::from_secs(60 * 45); // 45 minutes

            // Attempt to acquire a lock for 4 seconds
            match locking::acquire_lock(&redis_client, lock_key, &lock_value, 4).await {
                Ok(true) => {
                    if let Err(e) = warn_inactive_tickets(&pool, &http, warn_threshold).await {
                        eprintln!("Error warning inactive tickets: {:?}", e);
                    }

                    if let Err(e) = close_abandoned_tickets(&pool, &http, close_threshold).await {
                        eprintln!("Error closing abandoned tickets: {:?}", e);
                    }

                    let _ = locking::release_lock(&redis_client, lock_key, &lock_value).await;
                }
                Ok(false) => {
                    // Another instance is currently executing this loop cycle
                }
                Err(e) => {
                    eprintln!("Failed to coordinate Redis lock for ticket inactivity: {:?}", e);
                }
            }
        }
    });
}

/// Helper function to warn inactive tickets
async fn warn_inactive_tickets(
    pool: &sqlx::PgPool,
    http: &serenity::Http,
    threshold: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    // Fetch candidates safely without row locking since we hold the global Redis lock
    let rows_to_warn = sqlx::query!(
        r#"
        SELECT channel_id FROM tickets
        WHERE status = 'OPEN' AND last_activity < $1 AND warned = FALSE
        LIMIT 50
        "#,
        threshold
    )
        .fetch_all(pool)
        .await?;

    if rows_to_warn.is_empty() {
        return Ok(());
    }

    // Perform database updates inside a short-lived transaction
    let mut tx = pool.begin().await?;
    for row in &rows_to_warn {
        sqlx::query!(
            "UPDATE tickets SET warned = TRUE WHERE channel_id = $1",
            row.channel_id
        )
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    // Perform Discord API calls safely outside the database transaction
    for row in rows_to_warn {
        let channel_id = serenity::ChannelId::new(row.channel_id as u64);
        let _ = channel_id
            .say(
                http,
                "This ticket has been inactive. It will close in 15 minutes if there is no activity.",
            )
            .await;
    }

    Ok(())
}

/// Helper function to close completely abandoned tickets
async fn close_abandoned_tickets(
    pool: &sqlx::PgPool,
    http: &serenity::Http,
    threshold: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    let rows_to_close = sqlx::query!(
        r#"
        SELECT channel_id FROM tickets
        WHERE status = 'OPEN' AND last_activity < $1 AND warned = TRUE
        LIMIT 50
        "#,
        threshold
    )
        .fetch_all(pool)
        .await?;

    if rows_to_close.is_empty() {
        return Ok(());
    }

    let mut tx = pool.begin().await?;
    for row in &rows_to_close {
        sqlx::query!(
            "UPDATE tickets SET status = 'CLOSE', closed_at = CURRENT_TIMESTAMP WHERE channel_id = $1",
            row.channel_id
        )
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    for row in rows_to_close {
        let channel_id = serenity::ChannelId::new(row.channel_id as u64);
        let _ = channel_id.delete(http).await;
    }

    Ok(())
}

