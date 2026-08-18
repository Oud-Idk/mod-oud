use crate::core::config::message_layout::MessageLayout;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{ChannelId, MessageId, RoleId};
use std::fmt;

/// The captcha provider used for verification.
#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CaptchaType {
    /// Cloudflare Turnstile.
    #[default]
    Turnstile,
    /// hCaptcha.
    #[serde(rename = "HCAPTCHA")]
    HCaptcha,
}

impl fmt::Display for CaptchaType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Turnstile => write!(f, "TURNSTILE"),
            Self::HCaptcha => write!(f, "HCAPTCHA"),
        }
    }
}

/// Settings for the membership verification feature.
#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct VerificationSettings {
    /// Whether verification is enabled.
    pub enabled: Option<bool>,
    /// ID of the message users interact with in order to verify.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub verification_message_id: Option<MessageId>,
    /// ID of the channel the verification message is in.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub verification_channel_id: Option<ChannelId>,
    /// ID of the role granted upon successful verification.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub verification_role_id: Option<RoleId>,
    /// Message layout used for verification embeds.
    pub message: MessageLayout,
    /// Whether to use OAuth-based verification.
    #[serde(rename = "useOauth")]
    pub use_oauth: Option<bool>,
    /// The captcha provider to use, if any.
    pub captcha_type: Option<CaptchaType>,
}
