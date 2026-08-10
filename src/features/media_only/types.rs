use serde::{Deserialize, Serialize};
use serenity::all::RoleId;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, sqlx::FromRow)]
#[serde(default)]
pub struct MediaOnlyChannel {
    pub channel_id: i64,
    pub guild_id: i64,
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
    pub exempt_roles: Option<Vec<i64>>,
}

// Sensible defaults
impl Default for MediaOnlyChannel {
    fn default() -> Self {
        Self {
            enabled: false,
            channel_id: 0,
            guild_id: 0,
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
        self.exempt_roles
            .as_ref()
            .map(|roles| roles.iter().map(|&id| id as u64).map(RoleId::new).collect())
            .unwrap_or_default()
    }

    pub fn channel_id(&self) -> u64 {
        self.channel_id as u64
    }
}