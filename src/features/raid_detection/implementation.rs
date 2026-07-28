use chrono::{Duration, Utc};
use fred::prelude::*;
use fred::types::{Expiration, SetOptions};
use serde::{Deserialize, Serialize};
use std::error::Error;
use uuid::Uuid;
use crate::shared::locking::acquire_lock;

// Internal constants stay nice and cozy here
const HISTORY_HOURS: i64 = 168;
const CACHE_STATS_TTL_SECONDS: i64 = 900;
const HASH_TTL_DAYS: i64 = 14;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stats {
    pub threshold: i64,
    pub mean_min: f64,
    pub std_dev_min: f64,
}

#[derive(Debug, Clone)]
pub struct RaidCheckResult {
    pub is_anomaly: bool,
    pub current_joins_1m: i64,
    pub calculated_threshold: i64,
    pub avg_joins_per_min: f64,
    pub std_dev_per_min: f64,
}

#[derive(Clone)]
pub struct DynamicRaidDetector {
    redis: Client,
    pub window_size_seconds: i64,
    pub z_score_multiplier: f64,
    pub min_safe_limit: i64,
}

impl DynamicRaidDetector {
    /// Creates a new DynamicRaidDetector with custom threshold parameters!
    pub fn new(
        redis: Client,
        window_size_seconds: i64,
        z_score_multiplier: f64,
        min_safe_limit: i64,
    ) -> Self {
        Self {
            redis,
            window_size_seconds,
            z_score_multiplier,
            min_safe_limit,
        }
    }

    /// Records a member join and checks if it triggers a raid alert.
    pub async fn record_join(
        &self,
        guild_id: u64,
        user_id: u64,
    ) -> Result<RaidCheckResult, Box<dyn Error + Send + Sync>> {
        let now = Utc::now();
        let now_ts = now.timestamp();
        let hour_str = now.format("%Y%m%d%H").to_string();

        // 1. Ensure cached threshold is fresh
        let stats = self.get_or_update_threshold(guild_id, now).await?;

        // 2. Keys
        let zset_key = format!("guild:{guild_id}:recent_joins");
        let hash_key = format!("guild:{guild_id}:hourly_stats");
        let cutoff = (now_ts - self.window_size_seconds) as f64;

        // Unique member string: user_id:timestamp:nonce
        let nonce = &Uuid::new_v4().simple().to_string()[..8];
        let member = format!("{user_id}:{now_ts}:{nonce}");

        let pipeline = self.redis.pipeline();

        let _: () = pipeline.zadd(&zset_key, None, None, false, false, (now_ts as f64, &member)).await?;
        let _: i64 = pipeline.zremrangebyscore(&zset_key, "-inf", cutoff).await?;
        let current_joins_in_window: i64 = pipeline.zcard(&zset_key).await?;
        let _: () = pipeline.expire(&zset_key, self.window_size_seconds * 2, None).await?;
        let _: i64 = pipeline.hincrby(&hash_key, &hour_str, 1).await?;
        let _: () = pipeline.expire(&hash_key, HASH_TTL_DAYS * 86400, None).await?;

        let _: () = pipeline.all().await?;

        let threshold = stats.threshold;
        let is_anomaly = current_joins_in_window >= threshold;

        Ok(RaidCheckResult {
            is_anomaly,
            current_joins_1m: current_joins_in_window,
            calculated_threshold: threshold,
            avg_joins_per_min: (stats.mean_min * 100.0).round() / 100.0,
            std_dev_per_min: (stats.std_dev_min * 100.0).round() / 100.0,
        })
    }

    async fn get_or_update_threshold(
        &self,
        guild_id: u64,
        now: chrono::DateTime<Utc>,
    ) -> Result<Stats, Box<dyn Error + Send + Sync>> {
        let stats_cache_key = format!("guild:{guild_id}:cached_stats");

        // 1. Return cached stats if available
        if let Ok(Some(cached_json)) = self.redis.get::<Option<String>, _>(&stats_cache_key).await {
            if let Ok(stats) = serde_json::from_str::<Stats>(&cached_json) {
                return Ok(stats);
            }
        }

        let lock_key = format!("{stats_cache_key}:lock");
        let lock_value = Uuid::new_v4().to_string();

        // 2. Try acquiring lock using YOUR lock system (heartbeat = 2 secs -> TTL = 6 secs)
        let lock_guard = match acquire_lock(&self.redis, &lock_key, &lock_value, 2).await? {
            Some(guard) => guard,
            None => {
                return Ok(Stats {
                    threshold: self.min_safe_limit,
                    mean_min: 0.0,
                    std_dev_min: 0.0,
                });
            }
        };

        // 3. We hold the lock — recompute stats!
        let stats_res = self.recompute_stats(guild_id, now, &stats_cache_key).await;

        // 4. Explicitly release the lock and stop the watchdog task
        let _ = lock_guard.release().await;

        stats_res
    }

    async fn recompute_stats(
        &self,
        guild_id: u64,
        now: chrono::DateTime<Utc>,
        stats_cache_key: &str,
    ) -> Result<Stats, Box<dyn Error + Send + Sync>> {
        let hash_key = format!("guild:{guild_id}:hourly_stats");

        let fields: Vec<String> = (1..=HISTORY_HOURS)
            .map(|i| (now - Duration::hours(i)).format("%Y%m%d%H").to_string())
            .collect();

        let raw_history: Vec<Option<i64>> = self.redis.hmget(&hash_key, fields).await?;
        let history: Vec<f64> = raw_history
            .into_iter()
            .map(|v| v.unwrap_or(0) as f64)
            .collect();

        let n = history.len() as f64;
        let mean_hour = history.iter().sum::<f64>() / n;

        let variance_hour = history
            .iter()
            .map(|x| (x - mean_hour).powi(2))
            .sum::<f64>()
            / (n - 1.0).max(1.0);

        let std_dev_hour = variance_hour.sqrt();

        let mean_min = mean_hour / 60.0;
        let std_dev_min = std_dev_hour / 60.0_f64.sqrt();

        let dynamic_threshold = mean_min + (self.z_score_multiplier * std_dev_min);
        let final_threshold = (dynamic_threshold.ceil() as i64).max(self.min_safe_limit);

        let stats = Stats {
            threshold: final_threshold,
            mean_min,
            std_dev_min,
        };

        // Cache calculated stats
        let json_str = serde_json::to_string(&stats)?;
        let _: () = self
            .redis
            .set(
                stats_cache_key,
                json_str,
                Some(Expiration::EX(CACHE_STATS_TTL_SECONDS)),
                None,
                false,
            )
            .await?;

        // Cleanup oldest field
        let old_field = (now - Duration::hours(HISTORY_HOURS + 1))
            .format("%Y%m%d%H")
            .to_string();
        let _: () = self.redis.hdel(&hash_key, old_field).await.unwrap_or(());

        Ok(stats)
    }
}