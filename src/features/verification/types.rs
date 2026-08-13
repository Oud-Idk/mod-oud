use crate::core::config::message_layout::MessageLayout;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use std::fmt;

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
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
            Self::Turnstile => write!(f, "TURNSTILE"),
            Self::HCaptcha => write!(f, "HCAPTCHA"),
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