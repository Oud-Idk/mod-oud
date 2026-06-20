use crate::types::config::config::GuildSettings;
use futures_util::StreamExt;
use moka::future::Cache;
use redis::Client;
use std::time::Duration;

pub fn sync_configs(redis_client: &Client, config_cache: &Cache<i64, GuildSettings>) {
    let pubsub_client = redis_client.clone();
    let cache_clone = config_cache.clone();

    tokio::spawn(async move {
        loop {
            match pubsub_client.get_async_pubsub().await {
                Ok(mut pubsub) => {
                    if let Err(e) = pubsub.subscribe("config_updates").await {
                        eprintln!("Failed to subscribe to 'config_updates': {}", e);
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        continue;
                    }

                    let mut msg_stream = pubsub.into_on_message();

                    while let Some(msg) = msg_stream.next().await {
                        if let Ok(payload) = msg.get_payload::<String>() {
                            let parts: Vec<&str> = payload.split(':').collect();
                            if parts.len() == 2 && parts[0] == "invalidate" {
                                if let Ok(guild_id) = parts[1].parse::<i64>() {
                                    // Evict configuration from L1 Cache
                                    cache_clone.invalidate(&guild_id).await;
                                    tracing::debug!(guild_id, "Evicted guild config from memory via pub/sub");
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Redis PubSub connection dropped for config sync: {}. Reconnecting...", e);
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    });
}