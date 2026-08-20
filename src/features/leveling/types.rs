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
    pub min: i64,
    pub max: i64,
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
    pub cumulative_xp: i64,
    pub current_level: i64,
    pub current_xp: i64,
}

impl UserLevel {
    pub const fn from_raw(
        guild_id: i64,
        user_id: i64,
        cumulative_xp: i64,
        current_level: i64,
        current_xp: i64,
    ) -> Self {
        Self {
            guild_id: GuildId::new(guild_id.cast_unsigned()),
            user_id: UserId::new(user_id.cast_unsigned()),
            cumulative_xp,
            current_level,
            current_xp,
        }
    }
}

#[derive(Debug, Clone)]
pub struct LevelReward {
    pub level_requirement: i64,
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
pub struct ImageCardColors {
    pub text: String,
    pub bar_foreground: String,
    pub bar_background: String,
    pub accent: String,
    pub line_separator: String,
    pub username: String,
    pub statistics: String,
    pub background: String,
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
    pub image_card: ImageCardColors,
    /// How level-up notifications are delivered.
    pub notify: NotificationSettings,
    /// Maximum level a member can reach.
    pub level_cap: i64,
    /// Whether XP is kept when a member leaves and rejoins.
    pub keep_level_on_leave: bool,
}
