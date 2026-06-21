use std::time::Duration;
use tracing::{debug, instrument, trace};
// Added tracing imports

#[derive(Clone, Debug)]
pub struct SpamTracker {
    redis_conn: redis::aio::MultiplexedConnection,
}

impl SpamTracker {
    pub fn new(client: redis::aio::MultiplexedConnection) -> Self {
        Self { redis_conn: client }
    }

    /// Records a message timestamp and checks if the user has exceeded the limit.
    /// Returns `true` if the user is currently spamming.
    /// Async version of check_and_record using Redis Sorted Sets (ZSET)
    #[instrument(
        name = "spam_tracker::check_and_record",
        skip(self),
        fields(
            guild_id = %guild_id,
            user_id = %user_id,
            limit
        ),
        err
    )]
    pub async fn check_and_record_async(
        &self,
        guild_id: u64,
        user_id: u64,
        limit: usize,
        window: Duration,
    ) -> Result<bool, redis::RedisError> {
        trace!("Establishing Redis multiplexed connection");
        let key = format!("spam:records:{}:{}", guild_id, user_id);

        // Get current timestamp as a float (seconds since epoch)
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64();

        let clear_before = now - window.as_secs_f64();

        // To prevent key collisions if two messages arrive at the exact same microsecond,
        // we append a tiny piece of unique data (like a random number) to the member string.
        let random_suffix: u16 = rand::random();
        let member = format!("{}:{}", now, random_suffix);

        trace!("Executing atomic spam validation pipeline in Redis");
        let (_, _added, count, _expired): (usize, usize, usize, usize) = redis::pipe()
            .atomic()
            // Remove elements older than our sliding window
            .cmd("ZREMRANGEBYSCORE")
            .arg(&key)
            .arg("-inf")
            .arg(clear_before)
            // Add current message timestamp
            .cmd("ZADD")
            .arg(&key)
            .arg(now)
            .arg(member)
            // Count how many messages are left in the window
            .cmd("ZCARD")
            .arg(&key)
            // Ensure the set cleans itself up if the user stops sending messages
            .cmd("EXPIRE")
            .arg(&key)
            .arg(window.as_secs() + 1)
            .query_async(&mut self.redis_conn.clone())
            .await?;

        let is_spamming = count > limit;
        if is_spamming {
            debug!(
                window_message_count = count,
                limit,
                "User exceeded the message limit; flagging as spam"
            );
        } else {
            trace!(
                window_message_count = count,
                limit,
                "User checked; message count is within acceptable threshold"
            );
        }

        Ok(is_spamming)
    }

    /// Checks if a warning should be sent, enforcing a cooldown.
    /// Returns `true` if the cooldown has elapsed (or if no warning has been sent yet),
    /// and updates the warning timestamp.
    #[instrument(
        name = "spam_tracker::check_warning_cooldown",
        skip(self),
        fields(
            guild_id = %guild_id,
            user_id = %user_id
        ),
        err
    )]
    pub async fn check_warning_cooldown_async(
        &self,
        guild_id: u64,
        user_id: u64,
        cooldown: Duration,
    ) -> Result<bool, redis::RedisError> {
        trace!("Establishing Redis multiplexed connection");
        let key = format!("spam:warned:{}:{}", guild_id, user_id);

        trace!("Checking warning cooldown lock status in Redis");
        let set_result: Option<String> = redis::cmd("SET")
            .arg(&key)
            .arg("1")
            .arg("NX")
            .arg("PX")
            .arg(cooldown.as_millis())
            .query_async(&mut self.redis_conn.clone())
            .await?;

        // If set_result is Some, it successfully set the key (meaning no active cooldown existed).
        // If set_result is None, the key already exists (meaning cooldown is active).
        let cooldown_elapsed = set_result.is_some();
        if cooldown_elapsed {
            debug!("Warning cooldown has elapsed; user can be notified again");
        } else {
            trace!("Warning cooldown is still active; silencing potential notification");
        }

        Ok(cooldown_elapsed)
    }
}