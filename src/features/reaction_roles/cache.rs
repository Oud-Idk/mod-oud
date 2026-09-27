use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::types::Expiration;
use serenity::all::RoleId;
use tracing::{error, trace, warn};

/// Reads the cached role for a key.
/// Returns `Some(Some(role))` on a positive hit, `Some(None)` for a cached
/// negative marker, or `None` for an actual cache miss / read error.
pub async fn get_cached_role(redis: &Client, cache_key: &str) -> Option<Option<RoleId>> {
    match redis.get::<Option<String>, _>(cache_key).await {
        Ok(Some(cached_val)) => {
            if cached_val == "none" {
                return Some(None);
            }
            cached_val.parse::<u64>().map_or_else(
                |_| {
                    error!(
                        cache_key,
                        fault = "cached role id is not a u64",
                        "invalid role id in redis cache"
                    );
                    None
                },
                |role_id_u64| Some(Some(RoleId::new(role_id_u64))),
            )
        }
        Ok(None) => {
            trace!(cache_key, fallback = "db", "role cache miss");
            None
        }
        Err(e) => {
            warn!(cache_key, error = ?e, fallback = "db", "role cache read from redis failed");
            None
        }
    }
}

/// Caches a resolved role under the given key.
pub async fn cache_role(redis: &Client, cache_key: &str, role_id: RoleId) {
    if let Err(e) = redis
        .set::<(), _, _>(cache_key, role_id.get(), None, None, false)
        .await
    {
        warn!(cache_key, %role_id, error = %e, "role cache write to redis failed");
    }
}

/// Caches a negative result (no role) under the given key.
pub async fn cache_role_none(redis: &Client, cache_key: &str) {
    let expiration = Expiration::EX(300);
    if let Err(e) = redis
        .set::<(), _, _>(cache_key, "none", Some(expiration), None, false)
        .await
    {
        warn!(cache_key, error = %e, "negative cache write to redis failed");
    }
}
