use crate::core::config::message_layout::MessageLayout;
use crate::features::verification::VerificationSettings;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::ChannelId;

/// Config for the leave message sent when a member leaves.
#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct LeaveConfig {
    /// Whether leave messages are enabled.
    pub enabled: bool,
    /// Channel the leave message is sent to.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub channel_id: Option<ChannelId>,
    /// Message layout for the leave message.
    pub message: MessageLayout,
}

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct WelcomeMessageSettings {
    pub enabled: Option<bool>,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub channel_id: Option<ChannelId>,
    pub message: MessageLayout,
}

/// Config for the welcome messages.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct WelcomeConfig {
    /// Settings for the public welcome message.
    pub public: Option<WelcomeMessageSettings>,
    /// Settings for the private DM welcome message.
    pub private: Option<WelcomeMessageSettings>,
    /// Roles automatically assigned to new members.
    pub join_role_ids: Option<Vec<String>>,
    /// Verification settings used after joining, if any.
    pub verification: Option<VerificationSettings>,
}