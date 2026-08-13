use crate::shared::embed::{DiscordEmbed, Format, MessageGetter};
use serde::{Deserialize, Serialize};

/// Pure representation of a Discord message layout.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MessageLayout {
    /// The format of the message. Can be `Embed` / `Text`.
    #[serde(default)]
    pub format: Format,

    /// The message content if `format` is set to `Text`.
    #[serde(default)]
    pub content: String,

    /// The embed if `format` is set to `Embed`.
    #[serde(default)]
    pub embed: DiscordEmbed,
}

impl MessageGetter for MessageLayout {
    fn content(&self) -> &str {
        &self.content
    }

    fn embed(&self) -> &DiscordEmbed {
        &self.embed
    }

    fn format(&self) -> Format {
        self.format
    }
}

impl<T: MessageGetter> MessageGetter for sqlx::types::Json<T> {
    fn content(&self) -> &str {
        self.0.content()
    }

    fn embed(&self) -> &DiscordEmbed {
        self.0.embed()
    }

    fn format(&self) -> Format {
        self.0.format()
    }
}

/// A wrapper for features/messages that can be toggled on/off.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TogglableMessage {
    /// Whether the mesesage should be sent.
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// The message itself.
    #[serde(default)]
    pub message: MessageLayout,
}

const fn default_true() -> bool {
    true
}

impl TogglableMessage {
    /// Returns a reference to the inner message layout if enabled.
    #[must_use]
    pub const fn message_if_enabled(&self) -> Option<&MessageLayout> {
        if self.enabled {
            Some(&self.message)
        } else {
            None
        }
    }
}
