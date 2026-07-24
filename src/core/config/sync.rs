use crate::core::config::settings::GuildSettings;
use fred::clients::SubscriberClient;
use fred::prelude::{EventInterface, PubsubInterface};
use moka::future::Cache;

pub fn sync_configs(subscriber: &SubscriberClient, config_cache: &Cache<i64, GuildSettings>) {
    let cache_clone = config_cache.clone();

    subscriber.on_message(move |msg| {
        let cache = cache_clone.clone();

        async move {
            if msg.channel != "config_updates" {
                return Ok(());
            }

            let payload = match msg.value.convert::<String>() {
                Ok(val) => val,
                Err(e) => {
                    tracing::warn!(error = ?e, "Failed to convert config pub/sub message value to String");
                    return Ok(());
                }
            };

            tracing::debug!(payload = %payload, "Processing config update pub/sub event");

            let parts: Vec<&str> = payload.split(':').collect();
            if parts.len() != 2 || parts[0] != "invalidate" {
                tracing::warn!(
                    payload = %payload,
                    "Invalid pub/sub message payload format; expected 'invalidate:GUILD_ID'"
                );
                return Ok(());
            }

            let guild_id = match parts[1].parse::<i64>() {
                Ok(id) => id,
                Err(e) => {
                    tracing::warn!(
                        guild_id_raw = %parts[1],
                        error = ?e,
                        "Failed to parse guild ID into i64 from config update payload"
                    );
                    return Ok(());
                }
            };

            cache.invalidate(&guild_id).await;
            tracing::info!(guild_id = %guild_id, "Evicted guild config from memory cache via pub/sub");

            Ok(())
        }
    });

    let client_clone = subscriber.clone();
    tokio::spawn(async move {
        tracing::debug!("Attempting to register subscriber on 'config_updates' channel");

        match client_clone.subscribe("config_updates").await {
            Ok(_) => {
                tracing::info!("Subscribed to 'config_updates' channel. Listener active!");
            }
            Err(e) => {
                tracing::error!(error = ?e, "Failed to subscribe to 'config_updates' channel");
            }
        }
    });
}