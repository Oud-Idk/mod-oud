use crate::core::config::message_layout::TogglableMessage;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as, serde_conv};
use serenity::all::{ChannelId, MessageId, RoleId, UserId};
use std::time::Duration;

/// Payload describing a message logged inside a ticket channel.
#[derive(Debug)]
pub struct TicketLogPayload {
    /// ID of the ticket channel the message was sent in.
    pub ticket_channel_id: ChannelId,
    /// ID of the logged message.
    pub message_id: MessageId,
    /// ID of the message's author.
    pub author_id: UserId,
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
    |mins: u64| -> Result<_, std::convert::Infallible> { Ok(Duration::from_secs(mins * 60)) }
);

/// Config for the ticket system.
#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TicketConfig {
    /// Category that ticket channels are created in.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub category_id: Option<ChannelId>,
    /// Role allowed to manage tickets.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub ticket_role_id: Option<RoleId>,
    /// Whether the ticket system is enabled.
    pub enabled: bool,
    /// ID of the posted ticket-open message.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub posted_message_id: Option<MessageId>,
    /// ID of the channel the ticket-open message is posted in.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub channel_id: Option<ChannelId>,
    /// Inactivity warning threshold.
    #[serde_as(as = "DurationMinutes")]
    pub warn_threshold: Duration,
    /// Inactivity threshold after which tickets are deleted.
    #[serde_as(as = "DurationMinutes")]
    pub delete_threshold: Duration,
    /// How often inactive tickets are bumped.
    pub bump_every: i32,
    /// Message shown on the ticket-open panel.
    #[serde(default)]
    pub panel_message: TogglableMessage,
    /// Message shown when a ticket is opened.
    #[serde(default)]
    pub welcome_message: TogglableMessage,
}

impl Default for TicketConfig {
    fn default() -> Self {
        Self {
            category_id: None,
            ticket_role_id: None,
            enabled: false,
            posted_message_id: None,
            channel_id: None,
            warn_threshold: Duration::from_mins(30),
            delete_threshold: Duration::from_mins(45),
            bump_every: 20,
            panel_message: TogglableMessage::default(),
            welcome_message: TogglableMessage::default(),
        }
    }
}
