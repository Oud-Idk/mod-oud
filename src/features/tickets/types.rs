use crate::core::config::message_layout::TogglableMessage;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as, serde_conv};
use std::time::Duration;

/// Payload describing a message logged inside a ticket channel.
#[derive(Debug)]
pub struct TicketLogPayload {
    /// ID of the ticket channel the message was sent in.
    pub ticket_channel_id: i64,
    /// ID of the logged message.
    pub message_id: i64,
    /// ID of the message's author.
    pub author_id: i64,
    /// Content of the message.
    pub content: String,
    /// Display name of the message's author.
    pub sender_name: String,
    /// Whether the author is a ticket manager.
    pub is_ticket_manager: bool,
}

serde_conv!(
    DurationMinutes,
    Duration,
    |duration: &Duration| duration.as_secs() / 60,
    |mins: u64| -> Result<_, std::convert::Infallible> {
        Ok(Duration::from_secs(mins * 60))
    }
);

/// Config for the ticket system.
#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TicketConfig {
    /// Category that ticket channels are created in.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub category_id: Option<u64>,
    /// Role allowed to manage tickets.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub ticket_role_id: Option<u64>,
    /// Whether the ticket system is enabled.
    pub enabled: bool,
    /// ID of the posted ticket-open message.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub posted_message_id: Option<u64>,
    /// ID of the channel the ticket-open message is posted in.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub channel_id: Option<u64>,
    /// Inactivity warning threshold.
    #[serde_as(as = "DurationMinutes")]
    pub warn_threshold: Duration,
    /// Inactivity threshold after which tickets are deleted.
    #[serde_as(as = "DurationMinutes")]
    pub delete_threshold: Duration,
    /// How often inactive tickets are bumped.
    #[serde_as(as = "DurationMinutes")]
    pub bump_every: Duration,
    /// Message shown on the ticket-open panel.
    #[serde(default)]
    pub panel_message: TogglableMessage,
    /// Message shown when a ticket is opened.
    #[serde(default)]
    pub welcome_message: TogglableMessage,
}