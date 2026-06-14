use crate::types::embed::DiscordEmbed;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct WelcomeMessageSettings {
    pub enabled: Option<bool>,
    pub channel_id: Option<String>, // Used for public; ignored or None for private (DM)
    pub format: Option<String>,
    pub embed: Option<DiscordEmbed>,
    pub content: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct WelcomeConfig {
    pub public: Option<WelcomeMessageSettings>,
    pub private: Option<WelcomeMessageSettings>,
    pub join_role_ids: Option<Vec<String>>,
}