use crate::types::Error;
use futures_util::StreamExt;
// Import the async Cache from moka
use moka::future::Cache;
use redis::Client;
use std::time::Duration;
use tracing::debug;

async fn hydrate_active_tickets(
    redis_client: &Client,
    cache: &Cache<u64, ()>,
) -> Result<(), Error> {
    let mut conn = redis_client.get_multiplexed_async_connection().await?;
    let active_tickets_list: Vec<String> = redis::cmd("SMEMBERS")
        .arg("active_tickets")
        .query_async(&mut conn)
        .await
        .unwrap_or_default();

    // Clear everything currently cached in Moka
    cache.invalidate_all();

    // Insert active keys
    for channel_str in active_tickets_list {
        if let Ok(channel_id) = channel_str.parse::<u64>() {
            cache.insert(channel_id, ()).await;
        }
    }

    debug!("Hydrated active tickets into local Moka cache.");
    Ok(())
}

pub fn sync_tickets(redis_client: &Client, active_tickets_cache: &Cache<u64, ()>) {
    let pubsub_client = redis_client.clone();
    // Directly clone the Cache (it's essentially an Arc under the hood)
    let cache_clone = active_tickets_cache.clone();

    tokio::spawn(async move {
        loop {
            match pubsub_client.get_async_pubsub().await {
                Ok(mut pubsub) => {
                    if let Err(e) = pubsub.subscribe("ticket_updates").await {
                        eprintln!("Failed to subscribe to 'ticket_updates': {}", e);
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        continue;
                    }

                    if let Err(e) = hydrate_active_tickets(&pubsub_client, &cache_clone).await {
                        eprintln!("Failed to hydrate cache on reconnect: {}", e);
                    }

                    let mut msg_stream = pubsub.into_on_message();

                    while let Some(msg) = msg_stream.next().await {
                        if let Ok(payload) = msg.get_payload::<String>() {
                            let parts: Vec<&str> = payload.split(':').collect();
                            if parts.len() == 2 {
                                let action = parts[0];
                                if let Ok(channel_id) = parts[1].parse::<u64>() {
                                    match action {
                                        "open" => {
                                            cache_clone.insert(channel_id, ()).await;
                                        }
                                        "close" => {
                                            cache_clone.invalidate(&channel_id).await;
                                        }
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