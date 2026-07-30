use serde::{Deserialize, Serialize};
use serde_with::{serde_as, DisplayFromStr};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RaidDetectionConfig {
    pub enabled: bool,
    pub z_score_multiplier: f64,
    pub min_safe_limit: i64,
    pub window_size_seconds: i64,
    pub raid_actions: Vec<RaidAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stats {
    pub threshold: i64,
    pub mean_window: f64,
    pub std_dev_window: f64,
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
    PauseInvites { hours: i64 },
    Alert {
        #[serde_as(as = "DisplayFromStr")]
        channel_id: u64,
    },
    AutoBanNewAccounts { max_age_hours: u64 },
    TimeoutNewJoins { mins: u32 },
}