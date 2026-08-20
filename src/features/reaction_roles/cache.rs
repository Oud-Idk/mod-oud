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
            match cached_val.parse::<u64>() {
                Ok(role_id_u64) => Some(Some(RoleId::new(role_id_u64))),
                Err(_) => {
                    error!("Invalid role ID format in Redis cache: {}", cached_val);
                    None
                }
            }
        }
        Ok(None) => {
            trace!("Cache miss when finding role. Querying from database.");
            None
        }
        Err(e) => {
            warn!("Redis read error (falling back to database): {}", e);
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
        warn!("Failed to write role to Redis: {}", e);
    }
}

/// Caches a negative result (no role) under the given key.
pub async fn cache_role_none(redis: &Client, cache_key: &str) {
    let expiration = Expiration::EX(300);
    if let Err(e) = redis
        .set::<(), _, _>(cache_key, "none", Some(expiration), None, false)
        .await
    {
        warn!("Failed to write negative cache result to Redis: {}", e);
    }
}
