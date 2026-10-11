use crate::core::config::state::Error;
use crate::features::raid_detection::types::{RaidCheckResult, RaidStatsSnapshot, Stats};
use crate::features::raid_detection::{cache, keys};
use crate::shared::locking::acquire_lock;
use chrono::{DateTime, Utc};
use fred::clients::Client;
use serenity::all::{GuildId, UserId};
use tracing::{debug, info, instrument, warn};
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
            z_score_multiplier, min_safe_limit, "dynamic raid detector initialized"
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
        let set_success = cache::try_set_raid_active(&self.redis, guild_id, ttl_seconds).await?;

        if set_success {
            info!(%guild_id, ttl_seconds, "raid active flag set");
        } else {
            debug!(%guild_id, "raid active flag already set");
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
                "raid anomaly detected"
            );
        } else {
            debug!(
                %guild_id,
                %user_id,
                current_joins_in_window,
                threshold,
                "join recorded within normal thresholds"
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
            debug!(%guild_id, "retrieved stats threshold from cache");
            return Ok(stats);
        }

        debug!(%guild_id, "stats cache miss");
        let lock_key = keys::lock_key(&stats_cache_key);
        let lock_value = Uuid::new_v4().to_string();

        let Some(lock_guard) = acquire_lock(&self.redis, &lock_key, &lock_value, 2).await? else {
            warn!(
                %guild_id,
                min_safe_limit = self.min_safe_limit,
                fallback = "min_safe_limit",
                "stats recompute lock not acquired"
            );
            return Ok(Stats {
                threshold: self.min_safe_limit,
                mean_window: 0.0,
                std_dev_window: 0.0,
            });
        };

        let stats_res = self.recompute_stats(guild_id, now, &stats_cache_key).await;

        match lock_guard.release().await {
            Ok(true) => {}
            Ok(false) => {
                warn!(%guild_id, "stats recompute lock no longer owned at release");
            }
            Err(e) => {
                warn!(
                    error = ?e,
                    %guild_id,
                    "stats recompute lock release failed; lock will expire on its own"
                );
            }
        }

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

        let stats = calculate_threshold(
            self.z_score_multiplier,
            self.min_safe_limit,
            self.window_size_seconds,
            &history,
        );

        cache::cache_calculated_stats(&self.redis, now, stats_cache_key, &hash_key, &stats).await?;

        debug!(
            %guild_id,
            threshold = stats.threshold,
            mean_window = stats.mean_window,
            std_dev_window = stats.std_dev_window,
            "recomputed and cached threshold stats"
        );

        Ok(stats)
    }

    #[instrument(skip(self), fields(guild_id = %guild_id, ttl_seconds = ttl_seconds))]
    pub async fn extend_raid_active(
        &self,
        guild_id: GuildId,
        ttl_seconds: i64,
    ) -> Result<(), Error> {
        cache::extend_raid_active(&self.redis, guild_id, ttl_seconds).await?;
        debug!(%guild_id, ttl_seconds, "extended raid active TTL");
        Ok(())
    }

    /// Current join traffic and threshold, for the dashboard.
    ///
    /// Derives everything from the same history `record_join` uses, but records nothing and
    /// does not write the stats cache: a read must not extend that TTL, or a guild with the
    /// dashboard open would keep alive a key that only join traffic should refresh.
    #[allow(clippy::cast_precision_loss)]
    pub async fn current_stats(
        &self,
        guild_id: GuildId,
        now: DateTime<Utc>,
    ) -> Result<RaidStatsSnapshot, Error> {
        let current_joins_in_window = cache::count_joins_in_window(
            &self.redis,
            guild_id,
            self.window_size_seconds,
            now.timestamp(),
        )
        .await?;
        let is_raid_active = cache::check_raid_active(&self.redis, guild_id)
            .await
            .unwrap_or(false);

        let history = cache::get_history_from_cache(
            &self.redis,
            now,
            &keys::hourly_stats_hash_key(guild_id),
        )
        .await?;

        let stats_available = history.iter().any(|count| *count > 0.0);
        let stats = calculate_threshold(
            self.z_score_multiplier,
            self.min_safe_limit,
            self.window_size_seconds,
            &history,
        );

        let window_minutes = self.window_size_seconds as f64 / 60.0;

        debug!(
            %guild_id,
            current_joins_in_window,
            threshold = stats.threshold,
            stats_available,
            is_raid_active,
            "raid stats read for the dashboard"
        );

        Ok(RaidStatsSnapshot {
            current_joins_in_window,
            window_size_seconds: self.window_size_seconds,
            calculated_threshold: stats.threshold,
            avg_joins_per_min: per_minute(stats.mean_window, window_minutes),
            avg_joins_per_day: (stats.mean_window / self.window_size_seconds as f64)
                * SECONDS_PER_DAY,
            std_dev_per_min: per_minute(stats.std_dev_window, window_minutes.sqrt()),
            is_raid_active,
            stats_available,
        })
    }
}

const SECONDS_PER_DAY: f64 = 86_400.0;

/// Scales a window mean to a per-minute rate, rounded for display.
fn per_minute(window_value: f64, window_minutes: f64) -> f64 {
    ((window_value / window_minutes) * 100.0).round() / 100.0
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

    debug!(
        mean_hour,
        std_dev_hour,
        mean_window,
        std_dev_window,
        dynamic_threshold,
        final_threshold,
        "calculated dynamic threshold values"
    );

    Stats {
        threshold: final_threshold,
        mean_window,
        std_dev_window,
    }
}

#[cfg(test)]
mod tests {
    use super::calculate_threshold;

    /// The dashboard recomputes these numbers from the same history when its stats cache is
    /// cold, so the same fixture is asserted on both sides.
    #[test]
    fn sparse_traffic_falls_back_to_the_minimum_safe_limit() {
        let mut history = vec![0.0; 168];
        history[..17].fill(1.0);
        history[17] = 2.0;

        let stats = calculate_threshold(3.0, 5, 60, &history);

        assert_eq!(stats.threshold, 5);
        assert!((stats.mean_window - 0.001_884_92).abs() < 1e-8);
        assert!((stats.std_dev_window - 0.043_374_60).abs() < 1e-8);
    }

    #[test]
    fn empty_history_yields_the_minimum_safe_limit() {
        let stats = calculate_threshold(3.0, 5, 60, &vec![0.0; 168]);

        assert_eq!(stats.threshold, 5);
        assert!(stats.mean_window.abs() < f64::EPSILON);
        assert!(stats.std_dev_window.abs() < f64::EPSILON);
    }

    #[test]
    fn a_real_traffic_spike_raises_the_threshold_above_the_floor() {
        let mut history = vec![1.0; 168];
        history[0] = 500.0;

        let stats = calculate_threshold(3.0, 5, 60, &history);

        assert_eq!(stats.threshold, 15);
    }
}
