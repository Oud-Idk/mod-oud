use crate::core::config::message_layout::MessageLayout;
use serde::{Deserialize, Serialize};
use serde_with::{DefaultOnError, DisplayFromStr, serde_as};
use serenity::all::{ChannelId, GuildId, RoleId, UserId};

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NotificationScope {
    #[default]
    None,
    Dm,
    SpecifiedChannel,
    CurrentChannel,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScopeMode {
    #[default]
    Exempt,
    Enforced,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VcSession {
    pub join_time: i64,
    pub channel_id: ChannelId,
    pub accumulated_secs: i64,
    pub clock_started_at: Option<i64>,
}

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

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSettings {
    pub scope: NotificationScope,
    #[serde_as(as = "DefaultOnError<Option<DisplayFromStr>>")]
    pub channel_id: Option<ChannelId>,
    pub message: MessageLayout,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserLevel {
    pub guild_id: GuildId,
    pub user_id: UserId,
    pub cumulative_xp: i32,
    pub current_level: i32,
    pub current_xp: i32,
}

impl UserLevel {
    pub fn from_raw(
        guild_id: i64,
        user_id: i64,
        cumulative_xp: i32,
        current_level: i32,
        current_xp: i32,
    ) -> Self {
        Self {
            guild_id: GuildId::new(guild_id as u64),
            user_id: UserId::new(user_id as u64),
            cumulative_xp,
            current_level,
            current_xp,
        }
    }
}

#[derive(Debug, Clone)]
pub struct LevelReward {
    pub level_requirement: i32,
    pub roles_to_add: Option<Vec<RoleId>>,
    pub remove_previous_roles: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct XpMultiplier {
    pub target_id: i64,
    pub target_type: String,
    pub multiplier: f32,
}

#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LevelingScope {
    pub mode: ScopeMode,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[serde_as(as = "Vec<DisplayFromStr>")]
    pub roles: Vec<RoleId>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[serde_as(as = "Vec<DisplayFromStr>")]
    pub channels: Vec<ChannelId>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageCardSettings {
    pub text_color: String,
    pub bar_foreground_color: String,
    pub bar_background_color: String,
    pub accent_color: String,
    pub line_separator_color: String,
    pub username_color: String,
    pub statistics_color: String,
    pub background_color: String,
}

/// Top-level config for the leveling feature.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct LevelingConfig {
    /// Settings for text-based XP.
    pub text: TextSettings,
    /// Settings for voice-based XP.
    pub voice: VoiceSettings,
    /// Channels/roles that are exempt or enforced.
    pub scope: LevelingScope,
    /// Styling for the rank card image.
    pub image_card: ImageCardSettings,
    /// How level-up notifications are delivered.
    pub notify: NotificationSettings,
    /// Maximum level a member can reach.
    pub level_cap: u64,
    /// Whether XP is kept when a member leaves and rejoins.
    pub keep_level_on_leave: bool,
}
