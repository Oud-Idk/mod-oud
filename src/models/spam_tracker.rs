use std::time::Duration;

#[derive(Clone, Debug)]
pub struct SpamTracker {
    client: redis::Client,
}

impl SpamTracker {
    pub fn new(client: redis::Client) -> Self {
        Self { client }
    }

    /// Records a message timestamp and checks if the user has exceeded the limit.
    /// Returns `true` if the user is currently spamming.
    /// Async version of check_and_record using Redis Sorted Sets (ZSET)
    pub async fn check_and_record_async(
        &self,
        guild_id: u64,
        user_id: u64,
        limit: usize,
        window: Duration,
    ) -> Result<bool, redis::RedisError> {
        let mut conn = self.client.get_multiplexed_async_connection().await?;
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

        // Execute as an atomic transaction pipeline
        let (_, _added, count, _expired): (usize, usize, usize, usize) = redis::pipe()
            .atomic()
            // 1. Remove elements older than our sliding window
            .cmd("ZREMRANGEBYSCORE")
            .arg(&key)
            .arg("-inf")
            .arg(clear_before)
            // 2. Add current message timestamp
            .cmd("ZADD")
            .arg(&key)
            .arg(now)
            .arg(member)
            // 3. Count how many messages are left in the window
            .cmd("ZCARD")
            .arg(&key)
            // 4. Ensure the set cleans itself up if the user stops sending messages
            .cmd("EXPIRE")
            .arg(&key)
            .arg(window.as_secs() + 1)
            .query_async(&mut conn)
            .await?;

        // Returns true if the count of messages in this window exceeds the limit
        Ok(count > limit)
    }

    /// Checks if a warning should be sent, enforcing a cooldown.
    /// Returns `true` if the cooldown has elapsed (or if no warning has been sent yet),
    /// and updates the warning timestamp.
    pub async fn check_warning_cooldown_async(
        &self,
        guild_id: u64,
        user_id: u64,
        cooldown: Duration,
    ) -> Result<bool, redis::RedisError> {
        let mut conn = self.client.get_multiplexed_async_connection().await?;
        let key = format!("spam:warned:{}:{}", guild_id, user_id);

        // We use Redis's SET command with "NX" (Not eXists) and "EX" (EXpire in seconds).
        // This is an atomic operation: it will ONLY set the key if it doesn't already exist.
        let set_result: Option<String> = redis::cmd("SET")
            .arg(&key)
            .arg("1")
            .arg("NX")
            .arg("EX")
            .arg(cooldown.as_secs())
            .query_async(&mut conn)
            .await?;

        // If set_result is Some, it successfully set the key (meaning no active cooldown existed).
        // If set_result is None, the key already exists (meaning cooldown is active).
        Ok(set_result.is_some())
    }
}
