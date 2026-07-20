use crate::types::config::config::Format;
use crate::types::embed::DiscordEmbed;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct WelcomeMessageSettings {
    pub enabled: Option<bool>,
    pub channel_id: Option<String>,
    pub format: Option<Format>,
    pub embed: Option<DiscordEmbed>,
    pub content: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct VerificationSettings {
    pub enabled: Option<bool>,
    pub verification_message_id: Option<String>,
    pub verification_channel_id: Option<String>,
    pub verification_role_id: Option<String>,
    pub content: Option<String>,
    pub embed: DiscordEmbed,
    pub format: Format,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct WelcomeConfig {
    pub public: Option<WelcomeMessageSettings>,
    pub private: Option<WelcomeMessageSettings>,
    pub join_role_ids: Option<Vec<String>>,
    pub verification: Option<VerificationSettings>,
}