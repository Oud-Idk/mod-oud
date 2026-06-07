use crate::types::embed::DiscordEmbed;
use crate::types::flag::FlagSeverity;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct WelcomeSettings {
    pub enabled: Option<bool>,
    pub channel_id: Option<String>,
    pub format: Option<String>,
    pub embed: Option<DiscordEmbed>,
    pub content: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct GuildSettings {
    pub welcome: Option<WelcomeSettings>,
    pub join_role_id: Option<String>,
    pub message_log_channel_id: Option<String>,
    pub leave_channel_id: Option<String>,
    pub general_bot_logs_id: Option<String>,
    pub message_filter_above: Option<FlagSeverity>,
    pub ticket_category_id: Option<String>,
    pub ticket_role_id: Option<String>,
}