use crate::features::tickets::database;
use crate::features::tickets::types::TicketLogPayload;
use sqlx::{PgConnection, PgPool, Postgres, Transaction};
use std::time::Duration;
use tokio::sync::mpsc::UnboundedReceiver;
use tracing::{debug, error, info, instrument, trace};

/// Starts the background worker that batches ticket message logs and flushes them to the database.
pub fn start_ticket_logger(mut rx: UnboundedReceiver<TicketLogPayload>, pool: PgPool) {
    tokio::spawn(async move {
        let mut buffer = Vec::with_capacity(100);
        let mut interval = tokio::time::interval(Duration::from_secs(2));

        info!("Starting ticket logger worker task");

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    if !buffer.is_empty() {
                        let batch_size = buffer.len();
                        debug!(batch_size, "Interval tick hit; flushing ticket log buffer");

                        if let Err(e) = flush_batch(&pool, &mut buffer).await {
                            error!(error = ?e, batch_size, "Error flushing ticket logs on interval tick");
                        }
                    }
                }
                msg = rx.recv() => {
                    if let Some(payload) = msg {
                        trace!(
                            ticket_channel_id = %payload.ticket_channel_id,
                            message_id = %payload.message_id,
                            author_id = %payload.author_id,
                            "Received ticket log payload"
                        );

                        buffer.push(payload);

                        // If we hit 100 messages, flush immediately!
                        if buffer.len() >= 100 {
                            let batch_size = buffer.len();
                            debug!(batch_size, "Buffer capacity limit reached; flushing immediately");

                            if let Err(e) = flush_batch(&pool, &mut buffer).await {
                                error!(error = ?e, batch_size, "Error flushing ticket logs on buffer capacity limit");
                            }
                            interval.reset(); // Reset the timer
                        }
                    } else {
                        info!("Ticket logger receiver channel closed; flushing remaining logs and stopping worker task");

                        if !buffer.is_empty() {
                            let batch_size = buffer.len();
                            if let Err(e) = flush_batch(&pool, &mut buffer).await {
                                error!(error = ?e, batch_size, "Error performing final flush during shutdown");
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

    debug!(
        batch_size,
        "Starting batch flush of ticket logs to database"
    );
    database::flush_ticket_logs_to_db(db, &records).await?;
    debug!(
        batch_size,
        "Successfully committed ticket log batch to database"
    );

    Ok(())
}
