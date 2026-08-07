use crate::core::config::settings::MessageLayout;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, NoneAsEmptyString, serde_as, serde_conv};
use std::time::Duration;

#[derive(Debug)]
pub struct TicketLogPayload {
    pub ticket_channel_id: i64,
    pub message_id: i64,
    pub author_id: i64,
    pub content: String,
    pub sender_name: String,
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

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TicketConfig {
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub category_id: Option<u64>,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub ticket_role_id: Option<u64>,
    pub enabled: bool,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub posted_message_id: Option<u64>,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub channel_id: Option<u64>,
    #[serde_as(as = "DurationMinutes")]
    pub warn_threshold: Duration,
    #[serde_as(as = "DurationMinutes")]
    pub delete_threshold: Duration,
    #[serde_as(as = "DurationMinutes")]
    pub bump_every: Duration,
    #[serde(default)]
    pub panel_message: MessageLayout,
    #[serde(default)]
    pub welcome_message: MessageLayout,
}