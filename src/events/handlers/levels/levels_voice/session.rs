use crate::types::Error;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VcSession {
    pub join_time: i64, // Unix timestamp
    pub channel_id: u64,
}

/// Generates the key used for session storage in Redis.
pub fn get_session_key(guild_id: u64, user_id: u64) -> String {
    format!("vc_session:{}:{}", guild_id, user_id)
}

/// Saves a new voice session to Redis.
pub async fn save_session(
    redis: &mut redis::aio::MultiplexedConnection,
    key: &str,
    channel_id: u64,
    now: i64,
) -> Result<(), Error> {
    let session = VcSession {
        join_time: now,
        channel_id,
    };
    let serialized = serde_json::to_string(&session)?;
    let _: () = redis.set(key, serialized).await?;
    Ok(())
}

/// Retrieves and deletes the voice session from Redis in order to process it.
pub async fn consume_session(
    redis: &mut redis::aio::MultiplexedConnection,
    key: &str,
) -> Result<Option<VcSession>, Error> {
    let cached_session: Option<String> = redis.get(key).await.ok().flatten();
    if let Some(session_str) = cached_session {
        if let Ok(session) = serde_json::from_str::<VcSession>(&session_str) {
            // Delete the key to prevent processing it again
            let _: () = redis.del(key).await.unwrap_or_default();
            return Ok(Some(session));
        }
    }
    Ok(None)
}