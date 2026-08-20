use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serenity::all::{ChannelId, GuildId, RoleId};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum MediaType {
    Image,
    Video,
    Audio,
    Gif,
    Link,
    EmbeddedText,
}

impl MediaType {
    pub fn from_mime(mime: &str) -> Option<Self> {
        if mime.starts_with("image/gif") {
            Some(Self::Gif)
        } else if mime.starts_with("image/") {
            Some(Self::Image)
        } else if mime.starts_with("video/") {
            Some(Self::Video)
        } else if mime.starts_with("audio/") {
            Some(Self::Audio)
        } else {
            None
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(default)]
pub struct MediaOnlyChannel {
    pub channel_id: ChannelId,
    pub guild_id: GuildId,
    pub enabled: bool,

    // Goodbye 6 booleans, hello HashSet!
    pub allowed_media: HashSet<MediaType>,

    pub auto_thread: bool,
    pub thread_name_template: Option<String>,

    pub delete_warning_after_secs: i16,
    pub exempt_roles: Option<Vec<RoleId>>,
}

// Sensible defaults
impl Default for MediaOnlyChannel {
    fn default() -> Self {
        Self {
            channel_id: ChannelId::default(),
            guild_id: GuildId::default(),
            enabled: false,

            allowed_media: HashSet::from([
                MediaType::Image,
                MediaType::Video,
                MediaType::Gif,
                MediaType::Link,
                MediaType::EmbeddedText,
            ]),

            auto_thread: false,
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
