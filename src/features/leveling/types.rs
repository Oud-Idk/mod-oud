use crate::core::config::message_layout::MessageLayout;
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, DisplayFromStr};
use serenity::all::{ChannelId, GuildId, RoleId, UserId};

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(
    tag = "scope",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase"
)]
#[derive(Default)]
pub enum NotificationTarget {
    #[default]
    None,
    Dm,
    CurrentChannel,
    SpecifiedChannel {
        #[serde_as(as = "DisplayFromStr")]
        channel_id: ChannelId,
    },
}


#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSettings {
    #[serde(flatten)]
    pub target: NotificationTarget,
    pub message: MessageLayout,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScopeMode {
    #[default]
    Exempt,
    Enforced,
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

// ==========================================
// 3. Text & Voice Settings
// ==========================================
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Range {
    pub min: u32,
    pub max: u32,
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::struct_field_names)]
pub struct ImageCardColors {
    pub text_color: String,
    pub bar_foreground_color: String,
    pub bar_background_color: String,
    pub accent_color: String,
    pub line_separator_color: String,
    pub username_color: String,
    pub statistics_color: String,
    pub background_color: String,
}

/// Top-level configuration for the leveling and experience (XP) feature.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct LevelingConfig {
    /// Configuration for earning experience via text messages.
    pub text: TextSettings,
    /// Configuration for earning experience while active in voice channels.
    pub voice: VoiceSettings,
    /// Guild-specific channel and role filtering rules (exemptions or enforcements).
    pub scope: LevelingScope,
    /// Color and styling customizations for the generated rank card image.
    pub image_card: ImageCardColors,
    /// Delivery targets and message layouts for level-up announcements.
    pub notify: NotificationSettings,
    /// The maximum level a member can achieve. Set to `0` for uncapped leveling.
    pub level_cap: u32,
    /// Whether a member's XP and level progress are retained if they leave and rejoin the server.
    pub keep_level_on_leave: bool,
}

#[serde_as]
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(
    tag = "targetType",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase"
)]
pub enum XpTarget {
    Channel {
        #[serde_as(as = "DisplayFromStr")]
        target_id: ChannelId,
    },
    Role {
        #[serde_as(as = "DisplayFromStr")]
        target_id: RoleId,
    },
}

#[serde_as]
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct XpMultiplier {
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: GuildId,
    #[serde(flatten)]
    pub target: XpTarget,
    pub multiplier: f32,
}

#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LevelReward {
    pub id: Option<i64>,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub guild_id: Option<GuildId>,
    pub level_requirement: u32,
    #[serde(default)]
    #[serde_as(as = "Vec<DisplayFromStr>")]
    pub roles_to_add: Vec<RoleId>,
    #[serde(default)]
    pub remove_previous_roles: bool,
}

#[serde_as]
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserLevel {
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: GuildId,
    #[serde_as(as = "DisplayFromStr")]
    pub user_id: UserId,
    pub cumulative_xp: u64,
    pub current_level: u32,
    pub current_xp: u64,
    #[serde(default)]
    pub username: String,
}

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VcSession {
    pub join_time: i64,
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: ChannelId,
    pub accumulated_secs: i64,
    pub clock_started_at: Option<i64>,
}