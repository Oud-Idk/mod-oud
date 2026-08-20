use crate::features::automod::{cache, keys};
use anyhow::Result;
use fred::clients::Client;
use serenity::model::id::{GuildId, UserId};
use std::time::Duration;
use tracing::{debug, instrument, trace};

/// Redis-backed spam rate-limiter and notification cooldown tracker.
///
/// Uses a Redis Sorted Set (`ZSET`) sliding window to count user messages over time,
/// and atomic `SET NX` locks to throttle warning notifications so users aren't spammed with alerts.
#[derive(Clone, Debug)]
pub struct SpamTracker {
    redis_conn: Client,
}

/// Generates a unique member ID for Redis sorted set entries.
///
/// # Why the random suffix?
/// Redis `ZSET` values MUST be unique. If a user sends 2 messages in the exact same
/// microsecond, they would have the same timestamp score. Adding a random `u16` suffix
/// (e.g. `1712345678.123:42189`) (practically )guarantees two messages never
/// overwrite each other in Redis.
fn member_key(now: f64) -> String {
    let random_suffix: u16 = rand::random();
    format!("{now}:{random_suffix}")
}

impl SpamTracker {
    /// Creates a new [`SpamTracker`] wrapping an active Fred Redis client connection.
    #[must_use]
    pub const fn new(client: Client) -> Self {
        Self { redis_conn: client }
    }

    /// Records a new message from a user and checks if they have exceeded the spam threshold.
    ///
    /// # Arguments
    /// * `guild_id` - The ID of the Discord server.
    /// * `user_id` - The ID of the message author.
    /// * `limit` - Max allowed messages within the time `window` before flagging as spam.
    /// * `window` - The sliding window duration (e.g., 5 seconds).
    ///
    /// # Returns
    /// * `Ok(true)` - User has exceeded the message limit.
    /// * `Ok(false)` - User is not rate limiting
    ///
    /// # Errors
    /// Returns `Err` if communication with Redis fails or if the transaction execution errors out.
    #[instrument(
        name = "spam_tracker::check_and_record",
        skip(self),
        fields(
            %guild_id,
            user_id = %user_id,
            limit
        ),
        err
    )]
    pub async fn check_and_record_async(
        &self,
        guild_id: GuildId,
        user_id: UserId,
        limit: usize,
        window: Duration,
    ) -> Result<bool> {
        let key = keys::spam_record_key(guild_id, user_id);

        // Calculate current UNIX timestamp in seconds (with decimal float precision)
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64();

        // Anything older than this timestamp cutoff will be purged from the sliding window
        let clear_before = now - window.as_secs_f64();

        // Unique member entry for Redis ZSET
        let member_key = member_key(now);

        trace!("Executing atomic spam validation transaction in Redis");

        // Start atomic MULTI transaction
        let tx = cache::begin_spam_transaction(&self.redis_conn);

        // Execute sliding window cleanup + insert + count inside 1 transaction round-trip
        let count =
            cache::store_spam_record(window, &key, now, clear_before, &member_key, tx).await?;

        let is_spamming = count > limit;
        if is_spamming {
            debug!(
                window_message_count = count,
                limit, "User exceeded the message limit; flagging as spam"
            );
        } else {
            trace!(
                window_message_count = count,
                limit, "User checked; message count is within acceptable threshold"
            );
        }

        Ok(is_spamming)
    }

    /// Checks if a warning message can be sent to the user without spamming them with alerts.
    ///
    /// Uses `SET ... PX <cooldown> NX` lock as a cooldown timer.
    ///
    /// # Returns
    /// * `Ok(true)` - Cooldown has elapsed.
    /// * `Ok(false)` - Cooldown is still active.
    ///
    /// # Errors
    /// Returns an `Err` if the underlying Redis `SET` operation fails or network communication drops.
    #[instrument(
        name = "spam_tracker::check_warning_cooldown",
        skip(self),
        fields(
            %guild_id,
            user_id = %user_id
        ),
        err
    )]
    pub async fn check_warning_cooldown_async(
        &self,
        guild_id: GuildId,
        user_id: UserId,
        cooldown: Duration,
    ) -> Result<bool> {
        trace!("Checking warning cooldown status in Redis");
        let key = keys::spam_warned_key(guild_id, user_id);
        let cooldown = i64::try_from(cooldown.as_millis())?;

        // Set key to "1" with expiration PX (milliseconds).
        // SetOptions::NX = "Set if Not eXists".
        //
        // If the key doesn't exist -> Redis sets it and returns Some("OK").
        // If the key exists -> Redis ignores it and returns None.
        let cooldown_elapsed =
            cache::set_warning_cooldown(&self.redis_conn, &key, cooldown).await?;

        if cooldown_elapsed {
            debug!("Warning cooldown has elapsed; user can be notified again");
        } else {
            trace!("Warning cooldown is still active; silencing potential notification");
        }

        Ok(cooldown_elapsed)
    }
}
