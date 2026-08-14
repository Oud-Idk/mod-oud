use serde::{Deserialize, Serialize};
use serde_with::DisplayFromStr;
use serde_with::serde_as;
use serenity::all::Action;
use std::borrow::Cow;
use std::fmt;

/// The severity level associated with flagged profanity or offensive content.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, poise::ChoiceParameter, Serialize, Deserialize,
)]
#[serde(rename_all = "UPPERCASE")]
#[sqlx(type_name = "flag_severity", rename_all = "UPPERCASE")]
pub enum FlagSeverity {
    /// Mild offensive language or profanity.
    Mild,
    /// Moderate offensive language or profanity.
    Moderate,
    /// Severe offensive language, slurs, or harassment.
    Severe,
}

impl FlagSeverity {
    /// Helper to map the `rustrict` analysis flags to our custom [`FlagSeverity`] enum.
    #[must_use]
    pub fn from_analysis(analysis: rustrict::Type) -> Option<Self> {
        if analysis.is(rustrict::Type::SEVERE) {
            Some(Self::Severe)
        } else if analysis.is(rustrict::Type::MODERATE) {
            Some(Self::Moderate)
        } else if analysis.is(rustrict::Type::MILD) {
            Some(Self::Mild)
        } else {
            None
        }
    }

    /// Converts the [`FlagSeverity`] into its corresponding `rustrict::Type` representation.
    #[must_use]
    pub const fn to_type(self) -> rustrict::Type {
        match self {
            Self::Severe => rustrict::Type::SEVERE,
            Self::Moderate => rustrict::Type::MODERATE,
            Self::Mild => rustrict::Type::MILD,
        }
    }
}

impl fmt::Display for FlagSeverity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            Self::Mild => "MILD",
            Self::Moderate => "MODERATE",
            Self::Severe => "SEVERE",
        };
        write!(f, "{label}")
    }
}

/// The moderation action to take when a message filtering rule is triggered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RuleAction {
    /// Delete the offending message.
    Delete,
    /// Issue a formal moderation warning to the author.
    Warn,
    /// Apply a temporary communication timeout to the author.
    Timeout,
    /// Post a public reminder/warning in the channel.
    RemindPublicly,
    /// Send a private reminder/warning via Direct Message to the author.
    RemindPrivately,
}

impl RuleAction {
    /// Returns the uppercase string representation of the rule action.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Delete => "DELETE",
            Self::Warn => "WARN",
            Self::Timeout => "TIMEOUT",
            Self::RemindPublicly => "REMIND_PUBLICLY",
            Self::RemindPrivately => "REMIND_PRIVATELY",
        }
    }
}

/// Identified threat classifications returned by Google Safe Browsing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThreatType {
    /// Unknown or unspecified threat type.
    Unspecified,
    /// Malicious software that harms the user's device or system.
    Malware,
    /// Deceptive social engineering or phishing content.
    SocialEngineering,
    /// Unwanted software that modifies user settings or behaves deceitfully.
    UnwantedSoftware,
    /// Potentially harmful application (PHA).
    PotentiallyHarmfulApplication,
    /// An unrecognized threat type represented by its raw integer code.
    Unknown(i32),
}

impl From<i32> for ThreatType {
    fn from(val: i32) -> Self {
        match val {
            0 => Self::Unspecified,
            1 => Self::Malware,
            2 => Self::SocialEngineering,
            3 => Self::UnwantedSoftware,
            4 => Self::PotentiallyHarmfulApplication,
            other => Self::Unknown(other),
        }
    }
}

impl fmt::Display for ThreatType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::Unspecified => "THREAT_TYPE_UNSPECIFIED",
            Self::Malware => "MALWARE",
            Self::SocialEngineering => "SOCIAL_ENGINEERING",
            Self::UnwantedSoftware => "UNWANTED_SOFTWARE",
            Self::PotentiallyHarmfulApplication => "POTENTIALLY_HARMFUL_APPLICATION",
            Self::Unknown(val) => return write!(f, "UNKNOWN_THREAT_TYPE({val})"),
        };
        write!(f, "{name}")
    }
}

/// Defines how rule scoping filters apply to targets.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScopeMode {
    /// The specified roles and channels are excluded from the rule.
    #[default]
    Exempt,
    /// The rule is strictly enforced only on the specified roles and channels.
    Enforced,
}

/// Domain filtering behavior mode for external link verification.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Modes {
    /// Only domains on the allowed list are permitted.
    Allowlist,
    /// All domains are permitted except those on the blocked list.
    Denylist,
}

/// The verdict produced by running a message filter evaluation.
#[derive(Debug)]
pub enum FilterVerdict<'a> {
    /// The message passed all rules without any violations.
    Pass,
    /// The message violated a rule and must be blocked/actioned.
    Block {
        /// The name or identifier of the rule triggered.
        rule_name: Cow<'a, str>,
        /// The base configuration containing actions and scope.
        base_rule: Cow<'a, BaseRule>,
        /// The specific excerpt or content snippet that caused the trigger.
        trigger_content: Option<Cow<'a, str>>,
        /// An optional custom direct message to send to the author.
        custom_dm_message: Option<Cow<'a, str>>,
    },
    /// The message contains external URLs requiring verification via Safe Browsing.
    RequiresSafeBrowsingCheck {
        /// The URLs extracted from the message to check.
        urls: Vec<String>,
        /// The external links rule configuration to apply after verification.
        external_links: &'a ExternalLinksRule,
    },
}

impl FilterVerdict<'_> {
    /// Returns the original verdict if it is not [`FilterVerdict::Pass`], otherwise computes and returns `f()`.
    pub fn or_else<F>(self, f: F) -> Self
    where
        F: FnOnce() -> Self,
    {
        match self {
            Self::Pass => f(),
            other => other,
        }
    }

    /// Returns `true` if the verdict is [`FilterVerdict::Pass`].
    #[must_use]
    pub const fn is_pass(&self) -> bool {
        matches!(self, Self::Pass)
    }
}

/// Scoping configuration defining which roles and channels a rule applies to.
#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuleScope {
    /// The enforcement mode (e.g. exempt or enforce only).
    pub mode: ScopeMode,

    /// The list of Discord role IDs targeted by this scope.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[serde_as(as = "Vec<DisplayFromStr>")]
    pub roles: Vec<u64>,

    /// The list of Discord channel IDs targeted by this scope.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[serde_as(as = "Vec<DisplayFromStr>")]
    pub channels: Vec<u64>,
}

/// Configuration for detecting messages with excessive capital letters.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcessiveCapsRule {
    /// The common base rule settings.
    #[serde(flatten)]
    pub base: BaseRule,
    /// The uppercase ratio threshold required to trigger (between 0.0 and 1.0).
    pub threshold: f64,
    /// The minimum message character length before evaluation begins.
    pub min_length: u32,
}

/// Configuration for detecting messages with an excessive number of emojis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcessiveEmojisRule {
    /// The common base rule settings.
    #[serde(flatten)]
    pub base: BaseRule,
    /// The maximum allowed number of emojis in a single message.
    pub max_emojis: u32,
}

/// Configuration for detecting messages with excessive spoiler tags.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcessiveSpoilersRule {
    /// The common base rule settings.
    #[serde(flatten)]
    pub base: BaseRule,
    /// The spoiler ratio threshold required to trigger (between 0.0 and 1.0).
    pub threshold: f64,
}

/// Configuration for detecting messages with an excessive number of user or role mentions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcessiveMentionsRule {
    /// The common base rule settings.
    #[serde(flatten)]
    pub base: BaseRule,
    /// The maximum allowed number of mentions in a single message.
    pub max_mentions: u32,
}

/// Configuration for detecting rapid message spam.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AntiSpamRule {
    /// The common base rule settings.
    #[serde(flatten)]
    pub base: BaseRule,
    /// The maximum number of messages allowed within the defined time window.
    pub messages_per_window: u32,
    /// The rolling time window duration in seconds.
    pub window_seconds: u64,
}

/// Configuration for filtering external links and inspecting for malicious URLs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalLinksRule {
    /// The common base rule settings.
    #[serde(flatten)]
    pub base: BaseRule,
    /// When `true`, only links flagged as malicious by Safe Browsing are blocked.
    pub block_only_malicious: bool,
    /// The domain filtering mode (allowlist vs. denylist).
    pub mode: Modes,

    /// The list of explicitly allowed domain names.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allowed_domains: Vec<String>,

    /// The list of explicitly blocked domain names.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blocked_domains: Vec<String>,
}

/// Configuration for detecting offensive words, profanity, and toxicity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffensiveMessagesRule {
    /// The common base rule settings.
    #[serde(flatten)]
    pub base: BaseRule,
    /// The minimum severity threshold required to trigger an action.
    pub flag_threshold: FlagSeverity,
}

/// Rule configuration for detecting unauthorized Discord server invite links.
pub type ServerInvitesRule = BaseRule;

/// Rule configuration for detecting obfuscated or Zalgo text.
pub type ZalgoRule = BaseRule;

/// Rule configuration for detecting cryptocurrency wallet addresses.
pub type CryptoAddressRule = BaseRule;

/// A trait for retrieving the underlying [`BaseRule`] from wrapped rule structures.
pub trait HasBaseRule {
    /// Returns a reference to the common [`BaseRule`] configuration.
    fn base(&self) -> &BaseRule;
}

/// The master configuration container for all message filtering rules and global scopes.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MessageFilteringConfig {
    /// Server invite filter configuration.
    pub server_invites: Option<ServerInvitesRule>,
    /// External links filter configuration.
    pub external_links: Option<ExternalLinksRule>,
    /// Excessive capital letters filter configuration.
    pub excessive_caps: Option<ExcessiveCapsRule>,
    /// Excessive emojis filter configuration.
    pub excessive_emojis: Option<ExcessiveEmojisRule>,
    /// Excessive spoilers filter configuration.
    pub excessive_spoilers: Option<ExcessiveSpoilersRule>,
    /// Excessive mentions filter configuration.
    pub excessive_mentions: Option<ExcessiveMentionsRule>,
    /// Obfuscated Zalgo text filter configuration.
    pub zalgo: Option<ZalgoRule>,
    /// Anti-spam filter configuration.
    pub anti_spam: Option<AntiSpamRule>,
    /// Offensive language and profanity filter configuration.
    pub offensive_messages: Option<OffensiveMessagesRule>,
    /// Cryptocurrency address filter configuration.
    pub crypto_address: Option<CryptoAddressRule>,
    /// Global scoping exemptions or enforcements applied across all rules.
    pub global_settings: Option<RuleScope>,
}

/// Common base settings shared across all filter rules.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseRule {
    /// Whether this filter rule is active.
    pub enabled: bool,
    /// The list of actions to perform when the rule is triggered.
    pub action: Vec<RuleAction>,

    /// The duration in seconds for timeouts, if applicable.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_duration_seconds: Option<u64>,

    /// The scope defining which roles and channels this rule applies to.
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

/// Actions that are recorded in moderation audit logs.
pub enum LoggedAction {
    /// Message deletion action.
    Delete,
    /// Private DM reminder/warning action.
    RemindPrivately,
    /// Member timeout action.
    Timeout,
    /// An unrecognized or unhandled action type.
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
    /// Returns the lowercase string identifier of the logged action.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
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

/// Configuration settings for the honeypot trap channel.
#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HoneypotConfig {
    /// Whether the honeypot channel listener is enabled.
    pub enabled: Option<bool>,
    /// The Discord channel ID designated as the honeypot trap.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub channel_id: Option<u64>,
    /// Role IDs or names that are exempt from triggering the honeypot trap.
    pub exempt_roles: Option<Vec<String>>,
    /// Number of days of message history to delete upon triggering the honeypot.
    pub dmd: Option<u8>,
    /// Audit log reason attached to honeypot moderation actions.
    pub reason: Option<String>,
    /// Duration in seconds for any temporary punitive action applied.
    pub duration: Option<u64>,
}
