use fred::prelude::*;
use fred::types::sorted_sets::Ordering;
use fred::types::{Expiration, ExpireOptions, SetOptions};
use std::time::Duration;
use tracing::{debug, instrument, trace};

#[derive(Clone, Debug)]
pub struct SpamTracker {
    redis_conn: Client,
}

impl SpamTracker {
    pub fn new(client: Client) -> Self {
        Self { redis_conn: client }
    }

    /// Records a message timestamp and checks if the user has exceeded the limit.
    /// Returns `true` if the user is currently spamming.
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
    ) -> Result<bool, Error> {
        trace!("Establishing Redis transaction");
        let key = format!("spam:records:{}:{}", guild_id, user_id);

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64();

        let clear_before = now - window.as_secs_f64();

        let random_suffix: u16 = rand::random();
        let member = format!("{}:{}", now, random_suffix);

        trace!("Executing atomic spam validation transaction in Redis");

        let tx = self.redis_conn.multi();

        let _: () = tx.zremrangebyscore(&key, "-inf", clear_before).await?;
        let _: () = tx.zadd(
            &key,
            None::<SetOptions>,
            None::<Ordering>,
            false,
            false,
            (now, member)
        ).await?;
        let _: () = tx.zcard(&key).await?;
        let _: () = tx.expire(
            &key,
            (window.as_secs() + 1) as i64,
            None::<ExpireOptions>
        ).await?;

        let (_, _, count, _): (usize, usize, usize, usize) = tx.exec(true).await?;

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
    ) -> Result<bool, Error> {
        trace!("Checking warning cooldown status in Redis");
        let key = format!("spam:warned:{}:{}", guild_id, user_id);

        let set_result: Option<String> = self.redis_conn
            .set(
                &key,
                "1",
                Some(Expiration::PX(cooldown.as_millis() as i64)),
                Some(SetOptions::NX),
                false, // get = false
            )
            .await?;

        let cooldown_elapsed = set_result.is_some();
        if cooldown_elapsed {
            debug!("Warning cooldown has elapsed; user can be notified again");
        } else {
            trace!("Warning cooldown is still active; silencing potential notification");
        }

        Ok(cooldown_elapsed)
    }
}