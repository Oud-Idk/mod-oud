use crate::shared::embed::{DiscordEmbed, Format};
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, DisplayFromStr};
use std::fmt;
use crate::core::config::settings::MessageLayout;

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CaptchaType {
    #[default]
    Turnstile,
    #[serde(rename = "HCAPTCHA")]
    HCaptcha,
}

impl fmt::Display for CaptchaType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CaptchaType::Turnstile => write!(f, "TURNSTILE"),
            CaptchaType::HCaptcha => write!(f, "HCAPTCHA"),
        }
    }
}

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct VerificationSettings {
    pub enabled: Option<bool>,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub verification_message_id: Option<u64>,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub verification_channel_id: Option<u64>,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub verification_role_id: Option<u64>,
    pub message: MessageLayout,
    #[serde(rename = "useOauth")]
    pub use_oauth: Option<bool>,
    pub captcha_type: Option<CaptchaType>,
}