use crate::types::config::leveling::LevelingConfig;
use crate::types::config::message_filter::MessageFilteringConfig;
use crate::types::config::message_logging::MessageLoggingConfig;
use crate::types::config::ok_or_none;
use crate::types::config::welcome::WelcomeConfig;
use crate::types::embed::DiscordEmbed;
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, serde_conv, DefaultOnError, DisplayFromStr};
use std::time::Duration;

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
    #[serde(default, deserialize_with = "ok_or_none")]
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


#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MessageLayout {
    pub format: Format,
    pub content: String,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub embed: Option<DiscordEmbed>,
}

serde_conv!(
    DurationMinutes,
    Duration,
    |duration: &Duration| duration.as_secs() / 60,
    |mins: u64| -> Result<_, std::convert::Infallible> {
        Ok(Duration::from_secs(mins * 60))
    }
);

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TicketConfig {
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub category_id: Option<u64>,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub ticket_role_id: Option<u64>,
    pub enabled: Option<bool>,
    pub posted_message_id: Option<String>,
    pub channel_id: Option<String>,

    pub content: Option<String>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub embed: Option<DiscordEmbed>,
    pub format: Format,

    #[serde_as(as = "DurationMinutes")]
    pub warn_threshold: Duration,
    #[serde_as(as = "DurationMinutes")]
    pub delete_threshold: Duration,
    pub bump_every: i32,

    pub welcome_message: Option<MessageLayout>,
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
    pub tickets: Option<TicketConfig>,
}