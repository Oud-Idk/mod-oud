use fred::clients::Client;
use fred::interfaces::{FredResult, KeysInterface};
use fred::prelude::Expiration;

pub async fn cache_bad_word(cache_key: &str, conn: &Client, serialized: String) -> FredResult<()> {
    conn.set(
        cache_key,
        serialized,
        Some(Expiration::EX(3600)),
        None,
        false,
    )
    .await
}

/// Fetches the cached bad word rulesets for a guild from Redis, if present.
pub async fn get_cached_bad_words(conn: &Client, cache_key: &str) -> Option<String> {
    conn.get::<Option<String>, _>(cache_key)
        .await
        .unwrap_or(None)
}
