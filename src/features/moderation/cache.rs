use fred::clients::Client;
use fred::interfaces::{FredResult, KeysInterface};
use fred::types::SetOptions;

/// Write-once cache of the serialized pre-lockdown overwrite state.
/// Returns whether a value was written (i.e. no snapshot existed yet).
pub async fn set_pre_lockdown_state(redis: &Client, key: String, json: String) -> FredResult<bool> {
    let wrote: Option<()> = redis
        .set(key, json, None, Some(SetOptions::NX), false)
        .await?;
    Ok(wrote.is_some())
}

/// Reads a cached pre-lockdown overwrite state.
pub async fn get_pre_lockdown_state(redis: &Client, key: String) -> FredResult<Option<String>> {
    redis.get(&key).await
}

/// Removes a cached pre-lockdown overwrite state.
pub async fn delete_pre_lockdown_state(redis: &Client, key: String) -> FredResult<()> {
    let _: () = redis.del(key).await?;
    Ok(())
}
