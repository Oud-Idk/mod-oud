use crate::types::{Error, TicketInfo};
use poise::serenity_prelude as serenity;
use serenity::all::ChannelId;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::Instant;

pub async fn restore_active_tickets(
    ctx: &serenity::Context,
    pool: &sqlx::PgPool,
) -> Result<Arc<Mutex<HashMap<ChannelId, TicketInfo>>>, Error> {
    let active_tickets = Arc::new(Mutex::new(HashMap::new()));

    // Fetch the open tickets
    let rows = sqlx::query!("SELECT channel_id FROM tickets WHERE status = 'OPEN'")
        .fetch_all(pool)
        .await?;

    let mut tickets = active_tickets.lock().await;

    for row in rows {
        let channel_id = ChannelId::new(row.channel_id as u64);

        tickets.insert(
            channel_id,
            TicketInfo {
                message_count: 0,
                last_activity: Instant::now(),
                warned: false,
                last_button_message_id: None,
            },
        );

        // Spawn the inactivity monitor loop
        let ctx_clone = ctx.clone();
        let active_tickets_clone = active_tickets.clone();
        let db_clone = pool.clone();

        tokio::spawn(async move {
            if let Err(e) = crate::event_handlers::handlers::tickets::monitor_ticket_inactivity(
                ctx_clone,
                active_tickets_clone,
                channel_id,
                db_clone,
            )
            .await
            {
                eprintln!(
                    "Error in restored inactivity monitor for channel {}: {:?}",
                    channel_id, e
                );
            }
        });
    }

    if !tickets.is_empty() {
        println!("Restored {} active tickets from database.", tickets.len());
    }

    drop(tickets);
    Ok(active_tickets)
}
