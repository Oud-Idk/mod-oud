use crate::core::config::state::Error;
use crate::features::raid_detection::types::{RaidCheckResult, Stats};
use crate::features::raid_detection::{cache, keys};
use crate::shared::locking::acquire_lock;
use chrono::{DateTime, Utc};
use fred::clients::Client;
use fred::interfaces::KeysInterface; // Needed for .set() method
use fred::types::{Expiration, SetOptions};
use serenity::all::{GuildId, UserId};
use tracing::{debug, error, info, instrument, trace, warn};
use uuid::Uuid;

#[derive(Clone)]
pub struct DynamicRaidDetector {
    redis: Client,
    pub window_size_seconds: i64,
    pub z_score_multiplier: f64,
    pub min_safe_limit: i64,
}

impl DynamicRaidDetector {
    /// Creates a new `DynamicRaidDetector` with custom threshold parameters!
    pub fn new(
        redis: Client,
        window_size_seconds: i64,
        z_score_multiplier: f64,
        min_safe_limit: i64,
    ) -> Self {
        debug!(
            window_size_seconds,
            z_score_multiplier, min_safe_limit, "Initializing DynamicRaidDetector"
        );
        Self {
            redis,
            window_size_seconds,
            z_score_multiplier,
            min_safe_limit,
        }
    }

    #[instrument(skip(self), fields(%guild_id, ttl_seconds = ttl_seconds))]
    pub async fn try_set_raid_active(
        &self,
        guild_id: GuildId,
        ttl_seconds: i64,
    ) -> Result<bool, Error> {
        let active_key = keys::raid_active_key(guild_id);

        let res: Option<String> = self
            .redis
            .set(
                active_key,
                "1",
                Some(Expiration::EX(ttl_seconds)),
                Some(SetOptions::NX),
                false,
            )
            .await?;

        let set_success = res.is_some();
        if set_success {
            info!(%guild_id, ttl_seconds, "Set raid active flag for guild");
        } else {
            debug!(%guild_id, "Raid active flag already set for guild");
        }

        Ok(set_success)
    }

    /// Records a member join and checks if it triggers a raid alert.
    #[instrument(skip(self, now), fields(guild_id = %guild_id, user_id = %user_id))]
    #[allow(clippy::cast_precision_loss)]
    pub async fn record_join(
        &self,
        guild_id: GuildId,
        user_id: UserId,
        now: DateTime<Utc>,
    ) -> Result<RaidCheckResult, Error> {
        let now_ts = now.timestamp();
        let hour_str = now.format("%Y%m%d%H").to_string();

        trace!(%guild_id, %user_id, "Fetching or updating threshold stats");
        let stats = self.get_or_update_threshold(guild_id, now).await?;

        let current_joins_in_window = cache::record_join_event(
            &self.redis,
            self.window_size_seconds,
            guild_id,
            user_id,
            now_ts,
            &hour_str,
        )
        .await?;

        let threshold = stats.threshold;
        let is_anomaly = current_joins_in_window >= threshold;
        let window_minutes = self.window_size_seconds as f64 / 60.0;

        let result = RaidCheckResult {
            is_anomaly,
            current_joins_in_window,
            calculated_threshold: threshold,
            avg_joins_per_min: ((stats.mean_window / window_minutes) * 100.0).round() / 100.0,
            std_dev_per_min: ((stats.std_dev_window / window_minutes.sqrt()) * 100.0).round()
                / 100.0,
        };

        if is_anomaly {
            warn!(
                %guild_id,
                %user_id,
                current_joins_in_window,
                threshold,
                avg_joins_per_min = result.avg_joins_per_min,
                "Raid anomaly detected!"
            );
        } else {
            debug!(
                %guild_id,
                %user_id,
                current_joins_in_window,
                threshold,
                "Join recorded within normal thresholds"
            );
        }

        Ok(result)
    }

    #[instrument(skip(self, now), fields(guild_id = %guild_id))]
    async fn get_or_update_threshold(
        &self,
        guild_id: GuildId,
        now: DateTime<Utc>,
    ) -> Result<Stats, Error> {
        let stats_cache_key = keys::stats_cache_key(guild_id);

        if let Ok(Some(stats)) = cache::get_threshold(&self.redis, &stats_cache_key).await {
            trace!(%guild_id, "Retrieved stats threshold from cache");
            return Ok(stats);
        }

        debug!(%guild_id, "Stats cache miss, acquiring recompute lock");
        let lock_key = keys::lock_key(&stats_cache_key);
        let lock_value = Uuid::new_v4().to_string();

        let Some(lock_guard) = acquire_lock(&self.redis, &lock_key, &lock_value, 2).await? else {
            warn!(
                %guild_id,
                min_safe_limit = self.min_safe_limit,
                "Could not acquire lock to recompute threshold; falling back to min_safe_limit"
            );
            return Ok(Stats {
                threshold: self.min_safe_limit,
                mean_window: 0.0,
                std_dev_window: 0.0,
            });
        };

        let stats_res = self.recompute_stats(guild_id, now, &stats_cache_key).await;

        if let Err(ref e) = stats_res {
            error!(%guild_id, error = %e, "Failed to recompute stats");
        }

        let _ = lock_guard.release().await;

        stats_res
    }

    #[instrument(skip(self, now), fields(guild_id = %guild_id))]
    async fn recompute_stats(
        &self,
        guild_id: GuildId,
        now: DateTime<Utc>,
        stats_cache_key: &str,
    ) -> Result<Stats, Error> {
        let hash_key = keys::hourly_stats_hash_key(guild_id);
        let history = cache::get_history_from_cache(&self.redis, now, &hash_key).await?;

        debug!(
            %guild_id,
            history_points = history.len(),
            "Calculating threshold from historical data"
        );
        let stats = calculate_threshold(
            self.z_score_multiplier,
            self.min_safe_limit,
            self.window_size_seconds,
            &history,
        );

        cache::cache_calculated_stats(&self.redis, now, stats_cache_key, &hash_key, &stats).await?;

        info!(
            %guild_id,
            threshold = stats.threshold,
            mean_window = stats.mean_window,
            std_dev_window = stats.std_dev_window,
            "Successfully recomputed and cached threshold stats"
        );

        Ok(stats)
    }

    #[instrument(skip(self), fields(guild_id = %guild_id, ttl_seconds = ttl_seconds))]
    pub async fn extend_raid_active(
        &self,
        guild_id: GuildId,
        ttl_seconds: i64,
    ) -> Result<(), Error> {
        let active_key = keys::raid_active_key(guild_id);
        let _: () = self.redis.expire(active_key, ttl_seconds, None).await?;
        debug!(%guild_id, ttl_seconds, "Extended raid active TTL");
        Ok(())
    }
}

#[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation)]
#[instrument(skip(history), fields(history_len = history.len()))]
fn calculate_threshold(
    z_score_multiplier: f64,
    min_safe_limit: i64,
    window_size_seconds: i64,
    history: &[f64],
) -> Stats {
    let n = history.len() as f64;
    let mean_hour = history.iter().sum::<f64>() / n;

    let variance_hour =
        history.iter().map(|x| (x - mean_hour).powi(2)).sum::<f64>() / (n - 1.0).max(1.0);

    let std_dev_hour = variance_hour.sqrt();

    let scale = window_size_seconds as f64 / 3600.0;
    let mean_window = mean_hour * scale;
    let std_dev_window = std_dev_hour * scale.sqrt();

    let dynamic_threshold = z_score_multiplier.mul_add(std_dev_window, mean_window);
    let final_threshold = (dynamic_threshold.ceil() as i64).max(min_safe_limit);

    trace!(
        mean_hour,
        std_dev_hour,
        mean_window,
        std_dev_window,
        dynamic_threshold,
        final_threshold,
        "Calculated dynamic threshold values"
    );

    Stats {
        threshold: final_threshold,
        mean_window,
        std_dev_window,
    }
}

#[instrument(skip(redis), fields(guild_id = %guild_id))]
pub async fn clear_raid_active(redis: &Client, guild_id: GuildId) -> Result<(), Error> {
    let active_key = keys::raid_active_key(guild_id);
    let _: () = redis.del(active_key).await?;
    info!(%guild_id, "Cleared raid active state");
    Ok(())
}
