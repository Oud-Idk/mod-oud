use crate::types::Error;
use dashmap::DashSet;
use futures_util::StreamExt;
use redis::Client;
use std::sync::Arc;
use std::time::Duration;

async fn hydrate_active_tickets(
    redis_client: &Client,
    cache: &Arc<DashSet<u64>>,
) -> Result<(), Error> {
    let mut conn = redis_client.get_multiplexed_async_connection().await?;
    let active_tickets_list: Vec<String> = redis::cmd("SMEMBERS")
        .arg("active_tickets")
        .query_async(&mut conn)
        .await
        .unwrap_or_default();

    cache.clear();
    for channel_str in active_tickets_list {
        if let Ok(channel_id) = channel_str.parse::<u64>() {
            cache.insert(channel_id);
        }
    }
    println!("Hydrated {} active tickets into local cache.", cache.len());
    Ok(())
}

pub fn sync_tickets(redis_client: &Client, active_tickets_cache: &Arc<DashSet<u64>>) {
    let pubsub_client = redis_client.clone();
    let cache_clone = Arc::clone(&active_tickets_cache);
    tokio::spawn(async move {
        loop {
            match pubsub_client.get_async_pubsub().await {
                Ok(mut pubsub) => {
                    // 1. Subscribe first to start buffering incoming messages
                    if let Err(e) = pubsub.subscribe("ticket_updates").await {
                        eprintln!("Failed to subscribe to 'ticket_updates': {}", e);
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        continue;
                    }

                    // 2. Hydrate the cache from the database state
                    if let Err(e) = hydrate_active_tickets(&pubsub_client, &cache_clone).await {
                        eprintln!("Failed to hydrate cache on reconnect: {}", e);
                    }

                    // 3. Process the message stream (including any buffered during hydration)
                    let mut msg_stream = pubsub.into_on_message();

                    while let Some(msg) = msg_stream.next().await {
                        if let Ok(payload) = msg.get_payload::<String>() {
                            let parts: Vec<&str> = payload.split(':').collect();
                            if parts.len() == 2 {
                                let action = parts[0];
                                if let Ok(channel_id) = parts[1].parse::<u64>() {
                                    match action {
                                        "open" => { cache_clone.insert(channel_id); }
                                        "close" => { cache_clone.remove(&channel_id); }
                                        _ => {}
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Redis PubSub connection dropped: {}. Reconnecting in 5 seconds...", e);
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    });
}