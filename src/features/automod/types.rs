use serde::{Deserialize, Serialize};
use serde_with::DisplayFromStr;
use serde_with::serde_as;
use serenity::all::Action;
use std::borrow::Cow;
use std::fmt;

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, poise::ChoiceParameter, Serialize, Deserialize,
)]
#[serde(rename_all = "UPPERCASE")]
#[sqlx(type_name = "flag_severity", rename_all = "UPPERCASE")]
pub enum FlagSeverity {
    Mild,
    Moderate,
    Severe,
}

impl FlagSeverity {
    /// Helper to map the rustrict analysis to our custom enum
    pub fn from_analysis(analysis: rustrict::Type) -> Option<Self> {
        if analysis.is(rustrict::Type::SEVERE) {
            Some(FlagSeverity::Severe)
        } else if analysis.is(rustrict::Type::MODERATE) {
            Some(FlagSeverity::Moderate)
        } else if analysis.is(rustrict::Type::MILD) {
            Some(FlagSeverity::Mild)
        } else {
            None
        }
    }

    pub fn to_type(self) -> rustrict::Type {
        match self {
            FlagSeverity::Severe => rustrict::Type::SEVERE,
            FlagSeverity::Moderate => rustrict::Type::MODERATE,
            FlagSeverity::Mild => rustrict::Type::MILD,
        }
    }
}

impl fmt::Display for FlagSeverity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            FlagSeverity::Mild => "MILD",
            FlagSeverity::Moderate => "MODERATE",
            FlagSeverity::Severe => "SEVERE",
        };
        write!(f, "{}", label)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RuleAction {
    Delete,
    Warn,
    Timeout,
    RemindPublicly,
    RemindPrivately,
}

impl RuleAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            RuleAction::Delete => "delete",
            RuleAction::Warn => "warn",
            RuleAction::Timeout => "timeout",
            RuleAction::RemindPublicly => "remind_publicly",
            RuleAction::RemindPrivately => "remind_privately",
        }
    }
}


#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThreatType {
    Unspecified,
    Malware,
    SocialEngineering,
    UnwantedSoftware,
    PotentiallyHarmfulApplication,
    Unknown(i32),
}

impl From<i32> for ThreatType {
    fn from(val: i32) -> Self {
        match val {
            0 => ThreatType::Unspecified,
            1 => ThreatType::Malware,
            2 => ThreatType::SocialEngineering,
            3 => ThreatType::UnwantedSoftware,
            4 => ThreatType::PotentiallyHarmfulApplication,
            other => ThreatType::Unknown(other),
        }
    }
}

impl fmt::Display for ThreatType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            ThreatType::Unspecified => "THREAT_TYPE_UNSPECIFIED",
            ThreatType::Malware => "MALWARE",
            ThreatType::SocialEngineering => "SOCIAL_ENGINEERING",
            ThreatType::UnwantedSoftware => "UNWANTED_SOFTWARE",
            ThreatType::PotentiallyHarmfulApplication => "POTENTIALLY_HARMFUL_APPLICATION",
            ThreatType::Unknown(val) => return write!(f, "UNKNOWN_THREAT_TYPE({val})"),
        };
        write!(f, "{name}")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScopeMode {
    #[default]
    Exempt,
    Enforced,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Modes {
    Allowlist,
    Denylist,
}

#[derive(Debug)]
pub enum FilterVerdict<'a> {
    Pass,
    Block {
        rule_name: Cow<'a, str>,
        base_rule: Cow<'a, BaseRule>,
        trigger_content: Option<Cow<'a, str>>,
        custom_dm_message: Option<Cow<'a, str>>,
    },
    RequiresSafeBrowsingCheck {
        urls: Vec<String>,
        external_links: &'a ExternalLinksRule,
    },
}

impl<'a> FilterVerdict<'a> {
    pub fn or_else<F>(self, f: F) -> Self
    where
        F: FnOnce() -> Self,
    {
        match self {
            FilterVerdict::Pass => f(),
            other => other,
        }
    }

    pub fn is_pass(&self) -> bool {
        matches!(self, FilterVerdict::Pass)
    }
}

#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuleScope {
    pub mode: ScopeMode,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[serde_as(as = "Vec<DisplayFromStr>")]
    pub roles: Vec<u64>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[serde_as(as = "Vec<DisplayFromStr>")]
    pub channels: Vec<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcessiveCapsRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub threshold: f64,
    pub min_length: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcessiveEmojisRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub max_emojis: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcessiveSpoilersRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub threshold: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcessiveMentionsRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub max_mentions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AntiSpamRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub messages_per_window: u32,
    pub window_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalLinksRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub block_only_malicious: bool,
    pub mode: Modes,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allowed_domains: Vec<String>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blocked_domains: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffensiveMessagesRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub flag_threshold: FlagSeverity,
}

pub type ServerInvitesRule = BaseRule;
pub type ZalgoRule = BaseRule;

pub trait HasBaseRule {
    fn base(&self) -> &BaseRule;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageFilteringConfig {
    pub server_invites: Option<ServerInvitesRule>,
    pub external_links: Option<ExternalLinksRule>,
    pub excessive_caps: Option<ExcessiveCapsRule>,
    pub excessive_emojis: Option<ExcessiveEmojisRule>,
    pub excessive_spoilers: Option<ExcessiveSpoilersRule>,
    pub excessive_mentions: Option<ExcessiveMentionsRule>,
    pub zalgo: Option<ZalgoRule>,
    pub anti_spam: Option<AntiSpamRule>,
    pub offensive_messages: Option<OffensiveMessagesRule>,
    pub global_settings: Option<RuleScope>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseRule {
    pub enabled: bool,
    pub action: Vec<RuleAction>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_duration_seconds: Option<u64>,

    pub scope: RuleScope,
}

impl HasBaseRule for BaseRule {
    fn base(&self) -> &BaseRule {
        self
    }
}

macro_rules! impl_has_base {
    ($($t:ty),*) => {
        $(
            impl HasBaseRule for $t {
                fn base(&self) -> &BaseRule {
                    &self.base
                }
            }
        )*
    };
}

impl_has_base!(
    ExcessiveCapsRule,
    ExcessiveEmojisRule,
    ExcessiveSpoilersRule,
    ExcessiveMentionsRule,
    AntiSpamRule,
    ExternalLinksRule,
    OffensiveMessagesRule
);

pub enum LoggedAction {
    Delete,
    RemindPrivately,
    Timeout,
    Unknown,
}

impl From<&Action> for LoggedAction {
    fn from(action: &Action) -> Self {
        match action {
            Action::BlockMessage { .. } => Self::Delete,
            Action::Alert { .. } => Self::RemindPrivately,
            Action::Timeout(_) => Self::Timeout,
            _ => Self::Unknown,
        }
    }
}

impl LoggedAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Delete => "delete",
            Self::RemindPrivately => "remind_privately",
            Self::Timeout => "timeout",
            Self::Unknown => "unknown",
        }
    }
}

impl fmt::Display for LoggedAction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HoneypotConfig {
    pub enabled: Option<bool>,
    pub channel_id: Option<String>,
    pub exempt_roles: Option<Vec<String>>,
    pub dmd: Option<u8>,
    pub reason: Option<String>,
    pub duration: Option<u64>,
}