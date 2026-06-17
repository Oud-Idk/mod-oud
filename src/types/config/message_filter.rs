use serde::{Deserialize, Serialize};
use serde_with::{serde_as, DisplayFromStr};
// Required imports

// Placeholder for your external type
mod types {
    pub mod flag {
        use serde::{Deserialize, Serialize};
        #[derive(Debug, Clone, Copy, Serialize, Deserialize)]
        pub enum FlagSeverity { Low, Medium, High }
    }
}
use crate::types::flag::FlagSeverity;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ScopeMode {
    #[default]
    Exempt,
    Enforced,
}

#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuleScope {
    pub mode: ScopeMode,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[serde_as(as = "Vec<DisplayFromStr>")]
    pub roles: Vec<u64>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[serde_as(as = "Vec<DisplayFromStr>")]
    pub channels: Vec<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaseRule {
    pub enabled: bool,
    pub action: Vec<RuleAction>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_duration_seconds: Option<u64>,

    pub scope: RuleScope,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchStrategy {
    Exact,
    Substring,
    Regex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pattern {
    pub value: String,
    pub strategy: MatchStrategy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BadWordsRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub patterns: Vec<Pattern>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcessiveCapsRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub threshold: f64,
    pub min_length: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcessiveEmojisRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub max_emojis: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcessiveSpoilersRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub threshold: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcessiveMentionsRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub max_mentions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AntiSpamRule {
    #[serde(flatten)]
    pub base: BaseRule,
    pub messages_per_window: u32,
    pub window_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Modes {
    Allowlist,
    Denylist,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    BadWordsRule,
    ExcessiveCapsRule,
    ExcessiveEmojisRule,
    ExcessiveSpoilersRule,
    ExcessiveMentionsRule,
    AntiSpamRule,
    ExternalLinksRule,
    OffensiveMessagesRule
);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageFilteringConfig {
    pub bad_words: Option<BadWordsRule>,
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