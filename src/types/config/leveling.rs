use crate::types::config::config::Format;
use crate::types::config::message_filter::RuleScope;
use crate::types::config::ok_or_none;
use crate::types::embed::DiscordEmbed;
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, DefaultOnError, DisplayFromStr};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Range {
    pub min: i32,
    pub max: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct TextSettings {
    pub enabled: bool,
    pub xp_cooldown: u32,
    pub xp_range: Range,
    pub xp_on_tickets: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSettings {
    pub enabled: bool,
    pub xp_range: Range,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NotificationScope {
    #[default]
    None,
    Dm,
    SpecifiedChannel,
    CurrentChannel,
}

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSettings {
    pub scope: NotificationScope,
    #[serde_as(as = "DefaultOnError<Option<DisplayFromStr>>")]
    pub channel_id: Option<u64>,
    pub format: Format,
    pub content: String,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub embed: Option<DiscordEmbed>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct LevelingConfig {
    pub text: TextSettings,
    pub voice: VoiceSettings,
    pub scope: RuleScope,
    pub notify: NotificationSettings,

    pub level_cap: u64,
    pub keep_level_on_leave: bool,
}