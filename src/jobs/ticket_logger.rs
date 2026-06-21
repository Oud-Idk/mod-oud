use crate::events::handlers::tickets::handler::TicketLogPayload;
use sqlx::PgPool;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedReceiver;

pub fn start_ticket_logger(
    mut rx: UnboundedReceiver<TicketLogPayload>,
    pool: PgPool,
) {
    tokio::spawn(async move {
        let mut buffer = Vec::with_capacity(100);
        let mut interval = tokio::time::interval(Duration::from_secs(2));

        loop {
            tokio::select! {
                // 1. Every 2 seconds, flush whatever we have gathered
                _ = interval.tick() => {
                    if !buffer.is_empty() {
                        if let Err(e) = flush_batch(&pool, &mut buffer).await {
                            eprintln!("Error flushing ticket logs: {:?}", e);
                        }
                    }
                }
                // 2. Read messages from our fast in-memory queue
                msg = rx.recv() => {
                    match msg {
                        Some(payload) => {
                            buffer.push(payload);
                            // If we hit 100 messages, flush immediately!
                            if buffer.len() >= 100 {
                                if let Err(e) = flush_batch(&pool, &mut buffer).await {
                                    eprintln!("Error flushing ticket logs: {:?}", e);
                                }
                                interval.reset(); // Reset the timer
                            }
                        }
                        None => {
                            // Channel closed (system shutting down)
                            break;
                        }
                    }
                }
            }
        }
    });
}

async fn flush_batch(db: &PgPool, buffer: &mut Vec<TicketLogPayload>) -> Result<(), sqlx::Error> {
    let records = std::mem::replace(buffer, Vec::with_capacity(100));

    let mut chan_ids = Vec::with_capacity(records.len());
    let mut msg_ids = Vec::with_capacity(records.len());
    let mut auth_ids = Vec::with_capacity(records.len());
    let mut contents = Vec::with_capacity(records.len());
    let mut names = Vec::with_capacity(records.len());
    let mut managers = Vec::with_capacity(records.len());

    for rec in records {
        chan_ids.push(rec.ticket_channel_id);
        msg_ids.push(rec.message_id);
        auth_ids.push(rec.author_id);
        contents.push(rec.content);
        names.push(rec.sender_name);
        managers.push(rec.is_ticket_manager);
    }

    // Start a transaction so our bulk insert and bulk update are consistent!
    let mut tx = db.begin().await?;

    // Bulk Insert logs
    sqlx::query!(
        r#"
        INSERT INTO ticket_messages (ticket_channel_id, message_id, author_id, content, sender_name, is_ticket_manger)
        SELECT * FROM UNNEST($1::bigint[], $2::bigint[], $3::bigint[], $4::text[], $5::text[], $6::boolean[])
        "#,
        &chan_ids,
        &msg_ids,
        &auth_ids,
        &contents,
        &names,
        &managers
    )
        .execute(&mut *tx)
        .await?;

    // Bulk Update tickets count
    // This aggregates the count of messages per ticket in-memory, then runs a single bulk UPDATE! [11]
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

    Ok(())
}