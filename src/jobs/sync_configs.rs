use crate::types::config::config::GuildSettings;
use fred::clients::SubscriberClient;
use fred::prelude::{Client, EventInterface, PubsubInterface};
use moka::future::Cache;

pub fn sync_configs(subscriber: &SubscriberClient, config_cache: &Cache<i64, GuildSettings>) {
    let cache_clone = config_cache.clone();

    subscriber.on_message(move |msg| {
        let cache = cache_clone.clone();

        async move {
            if msg.channel != "config_updates" {
                return Ok(());
            }

            let Ok(payload) = msg.value.convert::<String>() else {
                return Ok(());
            };

            let parts: Vec<&str> = payload.split(':').collect();
            if parts.len() != 2 || parts[0] != "invalidate" {
                return Ok(());
            }

            let Ok(guild_id) = parts[1].parse::<i64>() else {
                return Ok(());
            };

            cache.invalidate(&guild_id).await;
            tracing::debug!(guild_id, "Evicted guild config from memory via pub/sub");

            Ok(())
        }
    });

    let client_clone = subscriber.clone();
    tokio::spawn(async move {
        if let Err(e) = client_clone.subscribe("config_updates").await {
            tracing::error!("Failed to subscribe to 'config_updates' channel: {:?}", e);
        } else {
            tracing::info!("Subscribed to 'config_updates' channel. Listener active!");
        }
    });
}