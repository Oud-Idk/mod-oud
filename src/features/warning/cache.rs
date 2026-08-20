use crate::features::warning::types::WarnThreshold;
use fred::clients::Client;
use fred::interfaces::{FredResult, KeysInterface};
use fred::prelude::Expiration;

/// Reads cached warning thresholds, returning `None` on a cache miss.
pub async fn get_cached_warn_thresholds(
    redis: &Client,
    cache_key: &str,
) -> Option<Vec<WarnThreshold>> {
    let cached_data: Option<String> = redis.get(cache_key).await.ok();
    cached_data
        .and_then(|json_string| serde_json::from_str::<Vec<WarnThreshold>>(&json_string).ok())
}

/// Writes warning thresholds to Redis with a 24h TTL.
pub async fn cache_warn_thresholds(redis: &Client, cache_key: &str, thresholds: &[WarnThreshold]) {
    if let Ok(json_string) = serde_json::to_string(thresholds) {
        let _: FredResult<()> = redis
            .set(
                cache_key,
                json_string,
                Some(Expiration::EX(86400)),
                None,
                false,
            )
            .await;
    }
}
