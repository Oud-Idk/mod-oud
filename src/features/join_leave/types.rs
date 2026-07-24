use crate::features::verification::VerificationSettings;
use crate::shared::embed::DiscordEmbed;
use crate::shared::embed::Format;
use crate::shared::ok_or_none;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct LeaveConfig {
    pub enabled: Option<bool>,
    pub channel_id: Option<String>,
    pub format: Option<Format>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub embed: Option<DiscordEmbed>,
    pub content: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct WelcomeMessageSettings {
    pub enabled: Option<bool>,
    pub channel_id: Option<String>,
    pub format: Option<Format>,
    pub embed: Option<DiscordEmbed>,
    pub content: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct WelcomeConfig {
    pub public: Option<WelcomeMessageSettings>,
    pub private: Option<WelcomeMessageSettings>,
    pub join_role_ids: Option<Vec<String>>,
    pub verification: Option<VerificationSettings>,
}