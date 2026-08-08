use crate::features::verification::VerificationSettings;
use crate::shared::embed::DiscordEmbed;
use crate::shared::embed::Format;
use crate::shared::ok_or_none;
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, DisplayFromStr};
use crate::core::config::settings::MessageLayout;

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct LeaveConfig {
    pub enabled: bool,
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: Option<u64>,
    pub message: MessageLayout,
}

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct WelcomeMessageSettings {
    pub enabled: Option<bool>,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub channel_id: Option<u64>,
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