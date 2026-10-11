use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};

#[derive(Debug, Clone, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "raid_event_type", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RaidEventType {
    Triggered,
    Resolved,
    ActionApplied,
}

/// Config for the raid detection feature.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RaidDetectionConfig {
    /// Whether raid detection is enabled.
    pub enabled: bool,
    /// Number of standard deviations above the mean considered a raid.
    pub z_score_multiplier: f64,
    /// Minimum join threshold before anomaly detection kicks in.
    pub min_safe_limit: i64,
    /// Size of the rolling join-rate window, in seconds.
    pub window_size_seconds: i64,
    /// Actions to run when a raid is detected.
    pub raid_actions: Vec<RaidAction>,
}

/// Matches the dashboard's `raidDetectionInputSchema` defaults, so a guild that has never
/// saved the feature is described the same way on both sides.
impl Default for RaidDetectionConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            z_score_multiplier: 3.0,
            min_safe_limit: 5,
            window_size_seconds: 60,
            raid_actions: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stats {
    pub threshold: i64,
    pub mean_window: f64,
    pub std_dev_window: f64,
}

/// Read-only view of current raid detection state, for the dashboard.
///
/// Mirrors what `record_join` computes, without recording a join or writing the
/// stats cache: a dashboard read must not extend the cache TTL.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RaidStatsSnapshot {
    /// Joins recorded inside the current detection window.
    pub current_joins_in_window: i64,
    /// Window size the guild is configured with, in seconds.
    pub window_size_seconds: i64,
    /// Joins per window the detector would currently trigger on.
    pub calculated_threshold: i64,
    /// Mean joins scaled to one minute.
    pub avg_joins_per_min: f64,
    /// Mean joins scaled to one day.
    pub avg_joins_per_day: f64,
    /// Standard deviation scaled to one minute.
    pub std_dev_per_min: f64,
    /// Whether a raid is currently being mitigated.
    pub is_raid_active: bool,
    /// False until the guild has recorded at least one join, at which point the
    /// threshold is the configured floor rather than a measurement.
    pub stats_available: bool,
}

#[derive(Debug, Clone)]
pub struct RaidCheckResult {
    pub is_anomaly: bool,
    pub current_joins_in_window: i64,
    pub calculated_threshold: i64,
    pub avg_joins_per_min: f64,
    pub std_dev_per_min: f64,
}

#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all_fields = "camelCase")]
#[serde(tag = "type")]
pub enum RaidAction {
    LockdownServer,
    BumpVerification,
    PauseInvites {
        hours: i64,
    },
    Alert {
        #[serde_as(as = "DisplayFromStr")]
        channel_id: u64,
    },
    AutoBanNewAccounts {
        max_age_hours: u64,
    },
    TimeoutNewJoins {
        mins: u32,
    },
}
