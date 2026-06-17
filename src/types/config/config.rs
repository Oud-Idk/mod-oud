use crate::types::config::leveling::LevelingConfig;
use crate::types::config::message_filter::MessageFilteringConfig;
use crate::types::config::message_logging::MessageLoggingConfig;
use crate::types::config::welcome::WelcomeConfig;
use crate::types::embed::DiscordEmbed;
use crate::types::flag::FlagSeverity;
use serde::{Deserialize, Deserializer, Serialize};
use serde_with::{serde_as, DefaultOnError, DisplayFromStr};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Embed,
    #[default]
    Text,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct LeaveConfig {
    pub enabled: Option<bool>,
    pub channel_id: Option<String>,
    pub format: Option<String>,
    pub embed: Option<DiscordEmbed>,
    pub content: Option<String>,
}

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct ReportConfig {
    pub enabled: bool,
    #[serde_as(as = "DefaultOnError<Option<DisplayFromStr>>")]
    pub reporting_channel: Option<u64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DMTemplateSetting {
    pub enabled: bool,
    pub content: String,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub embed: Option<DiscordEmbed>,
    pub format: Format,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ModerationDMsConfig {
    #[serde(default, deserialize_with = "ok_or_none")]
    pub warn: Option<DMTemplateSetting>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub pardon_warn: Option<DMTemplateSetting>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub unpardon_warn: Option<DMTemplateSetting>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub unpardon_delete_warn: Option<DMTemplateSetting>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub mute: Option<DMTemplateSetting>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub unmute: Option<DMTemplateSetting>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub kick: Option<DMTemplateSetting>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub ban: Option<DMTemplateSetting>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub softban: Option<DMTemplateSetting>,
}

fn ok_or_none<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    let v = serde_json::Value::deserialize(deserializer)?;

    match T::deserialize(v) {
        Ok(val) => Ok(Some(val)),
        Err(_) => Ok(None),
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct GuildSettings {
    pub welcome: Option<WelcomeConfig>,
    pub leave: Option<LeaveConfig>,
    pub message_logging: Option<MessageLoggingConfig>,
    pub message_filtering: Option<MessageFilteringConfig>,
    pub report: Option<ReportConfig>,
    pub moderation_dms: Option<ModerationDMsConfig>,
    pub leveling: Option<LevelingConfig>,

    pub leave_channel_id: Option<String>,
    pub general_bot_logs_id: Option<String>,
    pub message_filter_above: Option<FlagSeverity>,
    pub ticket_category_id: Option<String>,
    pub ticket_role_id: Option<String>,
}