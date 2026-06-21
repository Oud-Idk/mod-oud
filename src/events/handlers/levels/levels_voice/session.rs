use crate::types::Error;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use tracing::{trace, warn};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VcSession {
    pub join_time: i64,
    pub channel_id: u64,
}

/// Generates the key used for session storage in Redis.
pub fn get_session_key(guild_id: u64, user_id: u64) -> String {
    format!("vc_session:{}:{}", guild_id, user_id)
}

/// Saves a new voice session to Redis.
pub async fn save_session(
    redis_conn: &mut MultiplexedConnection,
    session_key: &str,
    channel_id: u64,
    join_time: i64,
) -> Result<(), Error> {
    trace!(session_key, channel_id, "Saving voice session state to Redis cache");
    let _: () = redis::pipe()
        .atomic()
        .cmd("HSET").arg(session_key).arg(&[
        ("channel_id", channel_id.to_string()),
        ("join_time", join_time.to_string()),
    ])
        // Set a generous 24-hour expiration (86400 seconds)
        .cmd("EXPIRE").arg(session_key).arg(86400)
        .query_async(redis_conn)
        .await?;

    Ok(())
}

/// Retrieves and deletes the voice session from Redis in order to process it.
pub async fn consume_session(
    redis: &mut redis::aio::MultiplexedConnection,
    key: &str,
) -> Result<Option<VcSession>, Error> {
    trace!(key, "Retrieving and consuming voice session atomically");

    let cached_session: Option<String> = redis::cmd("GETDEL")
        .arg(key)
        .query_async(redis)
        .await
        .ok()
        .flatten();

    if let Some(session_str) = cached_session {
        if let Ok(session) = serde_json::from_str::<VcSession>(&session_str) {
            return Ok(Some(session));
        }
    }
    Ok(None)
}