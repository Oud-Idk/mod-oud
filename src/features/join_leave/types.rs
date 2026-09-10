use crate::core::config::message_layout::MessageLayout;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::ChannelId;

/// Config for the leave message sent when a member leaves.
#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct LeaveConfig {
    #[serde(flatten)]
    /// Settings for the lave message.
    pub message: MessageSettings,
}

/// Config for the welcome messages.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct WelcomeConfig {
    /// Settings for the public welcome message.
    pub public: Option<MessageSettings>,
    /// Settings for the private DM welcome message.
    pub private: Option<MessageSettings>,
    /// Roles automatically assigned to new members.
    pub join_role_ids: Option<Vec<String>>,
}


#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct MessageSettings {
    pub enabled: Option<bool>,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub channel_id: Option<ChannelId>,
    pub message: MessageLayout,
    #[serde(default)]
    pub send_image: bool,
    #[serde(default)]
    pub image_style: WelcomeImageStyle,
}

/// Colors for the generated welcome card.
#[allow(clippy::struct_field_names)]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WelcomeImageStyle {
    #[serde(default = "default_background_color")]
    pub background_color: String,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    #[serde(default = "default_accent_color")]
    pub avatar_ring_color: String,
    #[serde(default = "white")]
    pub heading_color: String,
    #[serde(default = "white")]
    pub username_color: String,
    #[serde(default = "white")]
    pub member_text_color: String,
    #[serde(default = "default_accent_color")]
    pub accent_diag_color: String,
    #[serde(default = "white")]
    pub separator_color: String,
}

fn default_background_color() -> String {
    "#000000".to_string()
}
fn default_accent_color() -> String {
    "#5865F2".to_string()
}
fn white() -> String {
    "#FFFFFF".to_string()
}
fn grey() -> String {
    "#B5B5B5".to_string()
}

impl Default for WelcomeImageStyle {
    fn default() -> Self {
        Self {
            background_color: default_background_color(),
            accent_color: default_accent_color(),
            avatar_ring_color: default_accent_color(),
            heading_color: white(),
            username_color: white(),
            member_text_color: grey(),
            accent_diag_color: default_accent_color(),
            separator_color: white(),
        }
    }
}
