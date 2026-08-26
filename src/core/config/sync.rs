use crate::core::config::settings::GuildSettings;
use crate::features::bad_words::CompiledRuleset;
use fred::clients::SubscriberClient;
use fred::prelude::{EventInterface, PubsubInterface};
use moka::future::Cache;
use serenity::all::GuildId;
use std::str::FromStr;
use std::sync::Arc;

/// Listens for Redis Pub/Sub events on `config_updates` and evicts matching entries from the Moka caches.
///
/// Supported payload formats:
/// - `invalidate:GUILD_ID` — evicts the guild settings cache.
/// - `invalidate:GUILD_ID:bad_words` — evicts the bad word rulesets cache.
pub fn sync_configs(
    subscriber: &SubscriberClient,
    config_cache: &Cache<GuildId, GuildSettings>,
    bad_words_cache: &Cache<GuildId, Arc<Vec<CompiledRuleset>>>,
) {
    let config_cache = config_cache.clone();
    let bad_words_cache = bad_words_cache.clone();

    // Runs on every pub/sub events
    subscriber.on_message(move |msg| {
        let config_cache = config_cache.clone();
        let bad_words_cache = bad_words_cache.clone();

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
            // E.g. 'invalidate:12456:bad_words' becomes ['invalidate', '12456', 'bad_words']
            let parts: Vec<&str> = payload.split(':').collect();
            if parts.len() < 2 || parts[0] != "invalidate" {
                tracing::warn!(
                    payload = %payload,
                    "Invalid pub/sub message payload format; expected 'invalidate:GUILD_ID' or 'invalidate:GUILD_ID:CACHE_NAME'"
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

            match parts.get(2) {
                None => {
                    // Invalidate the Moka guild settings cache
                    config_cache.invalidate(&guild_id).await;
                    tracing::info!(%guild_id, "Evicted guild config from memory cache via pub/sub");
                }
                Some(&"bad_words") => {
                    // Invalidate the Moka bad word rulesets cache
                    bad_words_cache.invalidate(&guild_id).await;
                    tracing::info!(%guild_id, "Evicted bad word rulesets from memory cache via pub/sub");
                }
                Some(cache_name) => {
                    tracing::warn!(
                        %guild_id,
                        cache_name,
                        "Unknown cache name in config update payload"
                    );
                }
            }

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
