use serde::{Deserialize, Serialize};

/// Config for the invite tracking feature.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InviteTrackerConfig {
    /// Whether invite tracking is enabled.
    pub enabled: Option<bool>,
}
