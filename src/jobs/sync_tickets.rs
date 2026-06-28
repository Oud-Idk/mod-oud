use crate::types::Error;
use fred::clients::SubscriberClient;
use fred::prelude::*;
use fred::types::scan::Scanner;
use futures_util::{pin_mut, StreamExt};
use moka::future::Cache;
use tracing::debug;

pub async fn scan_all_set_members<T>(
    redis: &Client,
    set_key: &str,
    count_per_page: u32,
) -> Result<Vec<T>, fred::error::Error>
where
    T: std::str::FromStr,
{
    let mut all_members = Vec::new();
    let stream = redis.sscan(set_key, "*", Some(count_per_page));
    pin_mut!(stream);

    while let Some(res) = stream.next().await {
        let mut sscan_result = res?;

        if let Some(values) = sscan_result.take_results() {
            for value in values {
                if let Ok(key_str) = value.convert::<String>() {
                    if let Ok(item) = key_str.parse::<T>() {
                        all_members.push(item);
                    }
                }
            }
        }

        sscan_result.next();
    }

    Ok(all_members)
}

async fn hydrate_active_tickets(
    redis_client: &Client,
    cache: &Cache<u64, ()>,
) -> Result<(), Error> {
    cache.invalidate_all();

    let active_channels: Vec<u64> = scan_all_set_members(redis_client, "active_tickets", 250).await?;

    for channel_id in active_channels {
        cache.insert(channel_id, ()).await;
    }

    debug!("Hydrated active tickets into local cache.");
    Ok(())
}

pub fn sync_tickets(
    redis_client: &Client,
    subscriber_client: &SubscriberClient,
    active_tickets_cache: &Cache<u64, ()>,
) {
    let cache_clone = active_tickets_cache.clone();

    subscriber_client.on_message(move |msg| {
        let cache = cache_clone.clone();

        async move {
            if msg.channel != "ticket_updates" {
                return Ok(());
            }

            let Ok(payload) = msg.value.convert::<String>() else {
                return Ok(());
            };

            let parts: Vec<&str> = payload.split(':').collect();
            if parts.len() != 2 {
                return Ok(());
            }

            let action = parts[0];
            let Ok(channel_id) = parts[1].parse::<u64>() else {
                return Ok(());
            };

            match action {
                "open" => {
                    cache.insert(channel_id, ()).await;
                }
                "close" => {
                    cache.invalidate(&channel_id).await;
                }
                _ => {}
            }

            Ok(())
        }
    });

    let redis_clone_reconnect = redis_client.clone();
    let cache_clone_reconnect = active_tickets_cache.clone();
    subscriber_client.on_reconnect(move |server| {
        let redis = redis_clone_reconnect.clone();
        let cache = cache_clone_reconnect.clone();

        async move {
            tracing::info!("Reconnected to Redis server ({:?}). Re-hydrating active tickets...", server);
            if let Err(e) = hydrate_active_tickets(&redis, &cache).await {
                tracing::error!("Failed to re-hydrate tickets on reconnect: {:?}", e);
            }
            Ok(())
        }
    });

    let redis_clone_startup = redis_client.clone();
    let subscriber_clone_startup = subscriber_client.clone();
    let cache_clone_startup = active_tickets_cache.clone();
    tokio::spawn(async move {
        if let Err(e) = hydrate_active_tickets(&redis_clone_startup, &cache_clone_startup).await {
            tracing::error!("Failed to initially hydrate active tickets on startup: {:?}", e);
        }

        if let Err(e) = subscriber_clone_startup.subscribe("ticket_updates").await {
            tracing::error!("Failed to subscribe to 'ticket_updates': {:?}", e);
        } else {
            tracing::info!("Subscribed to 'ticket_updates' channel. Auto-reconnect and re-hydration active.");
        }
    });
}