use crate::core::config::settings::GuildSettings;
use fred::clients::Client;
use fred::interfaces::{FredResult, KeysInterface};
use fred::prelude::Expiration;
use tracing::{trace, warn};

pub async fn get_settings_from_redis(
    redis: &Client,
    cache_key: &str,
    guild_id: u64,
) -> Option<GuildSettings> {
    let cached_string: String = redis.get(cache_key).await.ok()?;

    match serde_json::from_str::<GuildSettings>(&cached_string) {
        Ok(settings) => {
            trace!(guild_id, key = %cache_key, "Retrieved settings from Redis cache");
            Some(settings)
        }
        Err(e) => {
            warn!(
                error = ?e,
                guild_id,
                key = %cache_key,
                "Failed to parse settings from Redis; falling back to DB"
            );
            None
        }
    }
}

pub async fn set_setting_to_redis(
    redis: &Client,
    settings: &GuildSettings,
    cache_key: &str,
) -> FredResult<()> {
    match serde_json::to_string(&settings) {
        Ok(serialized) => {
            redis
                .set(
                    cache_key,
                    serialized,
                    Some(Expiration::EX(3600)),
                    None,
                    false,
                )
                .await
        }
        Err(err) => {
            warn!(
                "Failed to serialize settings for key {}: {}. Skipping.",
                cache_key, err
            );
            Ok(())
        }
    }
}
