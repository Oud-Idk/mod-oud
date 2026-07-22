use crate::types::config::leveling::LevelingConfig;
use crate::types::config::message_filter::MessageFilteringConfig;
use crate::types::config::message_logging::MessageLoggingConfig;
use crate::types::config::ok_or_none;
use crate::types::config::welcome::WelcomeConfig;
use crate::types::embed::DiscordEmbed;
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, serde_conv, DisplayFromStr};
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug, Clone, Default, sqlx::Type, PartialEq, Copy)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[sqlx(type_name = "message_format", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Format {
    #[default]
    Embed,
    Text,
}

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

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct ReportConfig {
    pub enabled: bool,
    pub resolved_dm: Option<MessageLayout>,
    pub dismissed_dm: Option<MessageLayout>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DMTemplateSetting {
    pub enabled: bool,
    pub content: String,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub embed: Option<DiscordEmbed>,
    pub format: Format,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
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
    #[serde(default, deserialize_with = "ok_or_none")]
    pub honeypot: Option<DMTemplateSetting>,
}


#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MessageLayout {
    pub enabled: bool,
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
#[serde(rename_all = "camelCase")]
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

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InviteTrackerConfig {
    pub enabled: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HoneypotConfig {
    pub enabled: Option<bool>,
    pub channel_id: Option<String>,
    pub exempt_roles: Option<Vec<String>>,
    pub dmd: Option<u8>,
    pub reason: Option<String>,
    pub duration: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CounterType {
    TotalMembers,
    HumansOnly,
    BotsOnly,
    OnlineMembers,
    RoleCount,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterChannel {
    pub id: String,
    pub channel_id: String,
    pub counter_type: CounterType,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role_id: Option<String>,
    pub name_template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemberCounterConfig {
    pub enabled: bool,
    #[serde(default = "default_interval")]
    pub update_interval_minutes: u32,
    #[serde(default)]
    pub counters: Vec<CounterChannel>,
}

fn default_interval() -> u32 {
    15
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
// #[serde(rename_all = "camelCase")]
pub struct GuildSettings {
    pub welcome: Option<WelcomeConfig>,
    pub leave: Option<LeaveConfig>,
    pub message_logging: Option<MessageLoggingConfig>,
    pub message_filtering: Option<MessageFilteringConfig>,
    pub report: Option<ReportConfig>,
    pub moderation_dms: Option<ModerationDMsConfig>,
    pub leveling: Option<LevelingConfig>,
    pub tickets: Option<TicketConfig>,
    pub invite_tracker: Option<InviteTrackerConfig>,
    pub honeypot: Option<HoneypotConfig>,
    pub member_counter: Option<MemberCounterConfig>,
}

impl GuildSettings {
    pub fn is_message_logging_enabled(&self) -> bool {
        self.message_logging
            .as_ref()
            .and_then(|l| l.events.as_ref())
            .map_or(false, |e| {
                e.message_delete.unwrap_or(false) || e.message_edit.unwrap_or(false)
            })
    }
}