use crate::shared::embed::{DiscordEmbed, Format};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CaptchaType {
    #[default]
    Turnstile,
    #[serde(rename = "HCAPTCHA")]
    HCaptcha,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct VerificationSettings {
    pub enabled: Option<bool>,
    pub verification_message_id: Option<String>,
    pub verification_channel_id: Option<String>,
    pub verification_role_id: Option<String>,
    pub content: Option<String>,
    pub embed: Option<DiscordEmbed>,
    pub format: Option<Format>,
    #[serde(rename = "useOauth")]
    pub use_oauth: Option<bool>,
    pub captcha_type: Option<CaptchaType>,
}