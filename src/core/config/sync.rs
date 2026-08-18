use crate::core::config::settings::GuildSettings;
use fred::clients::SubscriberClient;
use fred::prelude::{EventInterface, PubsubInterface};
use moka::future::Cache;
use serenity::all::GuildId;
use std::str::FromStr;

/// Listens for Redis Pub/Sub events on `config_updates` and evicts matching guild IDs from the Moka cache.
///
/// Expects payload format: `invalidate:GUILD_ID`.
pub fn sync_configs(subscriber: &SubscriberClient, config_cache: &Cache<GuildId, GuildSettings>) {
    let cache_clone = config_cache.clone();

    // Runs on every pub/sub events
    subscriber.on_message(move |msg| {
        let cache = cache_clone.clone();

        async move {
            // Ignore irrelevant events
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

            // Splits the key between `:`
            // E.g. 'invalidate:12456' becomes ['invalidate', '12435']
            let parts: Vec<&str> = payload.split(':').collect();
            if parts.len() != 2 || parts[0] != "invalidate" {
                tracing::warn!(
                    payload = %payload,
                    "Invalid pub/sub message payload format; expected 'invalidate:GUILD_ID'"
                );
                return Ok(());
            }

            // Parses the second element (`guild_id`) as u64
            let Ok(guild_id) = GuildId::from_str(parts[1]).inspect_err(|e| {
                tracing::warn!(
                    guild_id_raw = %parts[1],
                    error = ?e,
                    "Failed to parse guild ID into u64 from config update payload"
                );
            }) else {
                return Ok(());
            };

            // Invalidate the Moka cache
            cache.invalidate(&guild_id).await;
            tracing::info!(%guild_id, "Evicted guild config from memory cache via pub/sub");

            Ok(())
        }
    });

    // Starts the worker
    let client_clone = subscriber.clone();
    tokio::spawn(async move {
        tracing::debug!("Attempting to register subscriber on 'config_updates' channel");

        match client_clone.subscribe("config_updates").await {
            Ok(()) => {
                tracing::info!("Subscribed to 'config_updates' channel. Listener active!");
            }
            Err(e) => {
                tracing::error!(error = ?e, "Failed to subscribe to 'config_updates' channel");
            }
        }
    });
}
