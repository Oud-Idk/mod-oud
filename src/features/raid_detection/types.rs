use serde::{Deserialize, Serialize};
use serde_with::serde_as;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RaidDetectionConfig {
    pub enabled: bool,
    pub z_score_multiplier: f64,
    pub min_safe_limit: i64,
    pub window_size_seconds: i64,
}