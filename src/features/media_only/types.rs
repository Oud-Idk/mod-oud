use serde::{Deserialize, Serialize};
use serenity::all::{ChannelId, GuildId, RoleId};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(default)]
pub struct MediaOnlyChannel {
    pub channel_id: ChannelId,
    pub guild_id: GuildId,
    pub enabled: bool,

    pub allow_images: bool,
    pub allow_videos: bool,
    pub allow_audio: bool,
    pub allow_gif: bool,
    pub allow_links: bool,
    pub allow_embedded_text: bool,

    pub auto_thread: bool,
    pub thread_name_template: Option<String>,

    pub delete_warning_after_secs: i16,
    pub exempt_roles: Option<Vec<RoleId>>,
}

// Sensible defaults
impl Default for MediaOnlyChannel {
    fn default() -> Self {
        Self {
            enabled: false,
            channel_id: ChannelId::default(),
            guild_id: GuildId::default(),
            allow_images: true,
            allow_videos: true,
            allow_audio: false,
            allow_gif: true,
            allow_links: true,
            auto_thread: false,
            allow_embedded_text: true,
            thread_name_template: Some("Discussion - {user}".to_string()),
            delete_warning_after_secs: 5,
            exempt_roles: None,
        }
    }
}

impl MediaOnlyChannel {
    pub fn exempt_role_ids(&self) -> Vec<RoleId> {
        self.exempt_roles.clone().unwrap_or_default()
    }
}