use crate::features::tickets::database;
use crate::features::tickets::types::TicketLogPayload;
use crate::shared::task;
use sqlx::PgPool;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedReceiver;
use tracing::{debug, error, info, instrument};

/// Starts the background worker that batches ticket message logs and flushes them to the database.
pub fn start_ticket_logger(mut rx: UnboundedReceiver<TicketLogPayload>, pool: PgPool) {
    task::spawn("ticket_logger_worker", async move {
        let mut buffer = Vec::with_capacity(100);
        let mut interval = tokio::time::interval(Duration::from_secs(2));

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    if !buffer.is_empty() {
                        let batch_size = buffer.len();

                        if let Err(e) = flush_batch(&pool, &mut buffer).await {
                            error!(
                                error = ?e,
                                batch_size,
                                trigger = "interval tick",
                                "ticket log flush failed"
                            );
                        }
                    }
                }
                msg = rx.recv() => {
                    if let Some(payload) = msg {
                        debug!(
                            ticket_channel_id = %payload.ticket_channel_id,
                            message_id = %payload.message_id,
                            author_id = %payload.author_id,
                            "ticket log payload received"
                        );

                        buffer.push(payload);

                        // If we hit 100 messages, flush immediately!
                        if buffer.len() >= 100 {
                            let batch_size = buffer.len();

                            if let Err(e) = flush_batch(&pool, &mut buffer).await {
                                error!(
                                    error = ?e,
                                    batch_size,
                                    trigger = "buffer capacity limit",
                                    "ticket log flush failed"
                                );
                            }
                            interval.reset(); // Reset the timer
                        }
                    } else {
                        info!("ticket logger receiver channel closed; flushing remaining logs and stopping worker task");

                        if !buffer.is_empty() {
                            let batch_size = buffer.len();
                            if let Err(e) = flush_batch(&pool, &mut buffer).await {
                                error!(
                                    error = ?e,
                                    batch_size,
                                    trigger = "shutdown",
                                    "final ticket log flush failed"
                                );
                            }
                        }
                        break;
                    }
                }
            }
        }
    });
}

#[instrument(skip(db, buffer))]
async fn flush_batch(db: &PgPool, buffer: &mut Vec<TicketLogPayload>) -> Result<(), sqlx::Error> {
    let records = std::mem::replace(buffer, Vec::with_capacity(100));
    let batch_size = records.len();
    database::flush_ticket_logs_to_db(db, &records).await?;
    debug!(batch_size, "committed ticket log batch to database");

    Ok(())
}
