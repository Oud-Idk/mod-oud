use crate::events::handlers::tickets::handler::TicketLogPayload;
use sqlx::PgPool;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedReceiver;
use tracing::{debug, error, info, instrument, trace};

pub fn start_ticket_logger(
    mut rx: UnboundedReceiver<TicketLogPayload>,
    pool: PgPool,
) {
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
                    match msg {
                        Some(payload) => {
                            trace!(
                                ticket_channel_id = payload.ticket_channel_id,
                                message_id = payload.message_id,
                                author_id = payload.author_id,
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
                        }
                        None => {
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
        }
    });
}

#[instrument(skip(db, buffer))]
async fn flush_batch(db: &PgPool, buffer: &mut Vec<TicketLogPayload>) -> Result<(), sqlx::Error> {
    let records = std::mem::replace(buffer, Vec::with_capacity(100));
    let batch_size = records.len();

    debug!(batch_size, "Starting batch flush of ticket logs to database");

    let mut chan_ids = Vec::with_capacity(records.len());
    let mut msg_ids = Vec::with_capacity(records.len());
    let mut auth_ids = Vec::with_capacity(records.len());
    let mut contents = Vec::with_capacity(records.len());
    let mut managers = Vec::with_capacity(records.len());

    for rec in records {
        chan_ids.push(rec.ticket_channel_id);
        msg_ids.push(rec.message_id);
        auth_ids.push(rec.author_id);
        contents.push(rec.content);
        managers.push(rec.is_ticket_manager);
    }

    // Start a transaction so our bulk insert and bulk update are consistent!
    let mut tx = db.begin().await?;

    // Bulk Insert logs
    sqlx::query!(
        r#"
        INSERT INTO ticket_messages (ticket_channel_id, message_id, author_id, content, is_ticket_manger)
        SELECT * FROM UNNEST($1::bigint[], $2::bigint[], $3::bigint[], $4::text[], $5::boolean[])
        "#,
        &chan_ids,
        &msg_ids,
        &auth_ids,
        &contents,
        &managers
    )
        .execute(&mut *tx)
        .await?;

    // Bulk Update tickets count
    sqlx::query!(
        r#"
        UPDATE tickets t
        SET message_count = t.message_count + sub.cnt
        FROM (
            SELECT ticket_channel_id, COUNT(*) as cnt
            FROM UNNEST($1::bigint[]) AS ticket_channel_id
            GROUP BY ticket_channel_id
        ) sub
        WHERE t.channel_id = sub.ticket_channel_id;
        "#,
        &chan_ids
    )
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    debug!(batch_size, "Successfully committed ticket log batch to database");
    Ok(())
}