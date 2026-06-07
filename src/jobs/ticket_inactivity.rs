use chrono::{DateTime, Utc};
use poise::serenity_prelude as serenity;
use std::sync::Arc;
use std::time::Duration;

pub fn start_ticket_inactivity_worker(pool: sqlx::PgPool, http: Arc<serenity::Http>) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;

            let now = Utc::now();
            let warn_threshold = now - Duration::from_secs(60 * 30); // 30 minutes
            let close_threshold = now - Duration::from_secs(60 * 45); // 45 minutes

            // Run the distinct jobs, logging errors individually
            if let Err(e) = warn_inactive_tickets(&pool, &http, warn_threshold).await {
                eprintln!("Error warning inactive tickets: {:?}", e);
            }

            if let Err(e) = close_abandoned_tickets(&pool, &http, close_threshold).await {
                eprintln!("Error closing abandoned tickets: {:?}", e);
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
    let mut tx = pool.begin().await?;

    // Fetch and lock candidate rows
    let rows_to_warn = sqlx::query!(
        r#"
        SELECT channel_id FROM tickets
        WHERE status = 'OPEN' AND last_activity < $1 AND warned = FALSE
        FOR UPDATE SKIP LOCKED
        "#,
        threshold
    )
    .fetch_all(&mut *tx)
    .await?;

    if rows_to_warn.is_empty() {
        return Ok(());
    }

    // Update warned status in DB
    for row in &rows_to_warn {
        sqlx::query!(
            "UPDATE tickets SET warned = TRUE WHERE channel_id = $1",
            row.channel_id
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    // Send warning messages to Discord after committing the transaction
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
    let mut tx = pool.begin().await?;

    // Fetch and lock candidate rows
    let rows_to_close = sqlx::query!(
        r#"
        SELECT channel_id FROM tickets
        WHERE status = 'OPEN' AND last_activity < $1 AND warned = TRUE
        FOR UPDATE SKIP LOCKED
        "#,
        threshold
    )
    .fetch_all(&mut *tx)
    .await?;

    if rows_to_close.is_empty() {
        return Ok(());
    }

    // Mark as closed in DB
    for row in &rows_to_close {
        sqlx::query!(
            "UPDATE tickets SET status = 'CLOSE', closed_at = CURRENT_TIMESTAMP WHERE channel_id = $1",
            row.channel_id
        )
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    // Delete Discord channels after committing the transaction
    for row in rows_to_close {
        let channel_id = serenity::ChannelId::new(row.channel_id as u64);
        let _ = channel_id.delete(http).await;
    }

    Ok(())
}
