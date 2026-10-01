use crate::core::config::message_layout::TogglableMessage;
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{ChannelId, GuildId, MessageId, Permissions, UserId};

/// A moderator action available on a report alert in the reporting channel.
///
/// The slug is the wire format: it appears in the button custom id, the modal custom id, and
/// the in-channel audit line. Both ends of that agree only through this enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportAction {
    DeleteMessage,
    Warn,
    Timeout,
    Ban,
    Dismiss,
    Actioned,
}

impl ReportAction {
    /// Every action, in the order the buttons are laid out.
    pub const ALL: [Self; 6] = [
        Self::DeleteMessage,
        Self::Warn,
        Self::Timeout,
        Self::Ban,
        Self::Dismiss,
        Self::Actioned,
    ];

    /// The wire token for this action.
    #[must_use]
    pub const fn slug(self) -> &'static str {
        match self {
            Self::DeleteMessage => "delete",
            Self::Warn => "warn",
            Self::Timeout => "timeout",
            Self::Ban => "ban",
            Self::Dismiss => "dismiss",
            Self::Actioned => "actioned",
        }
    }

    /// Parses a wire token. Unknown tokens yield `None` so a stale or hand-crafted custom id
    /// is ignored rather than guessed at.
    #[must_use]
    pub fn from_slug(slug: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|a| a.slug() == slug)
    }

    /// The button label.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::DeleteMessage => "Delete message",
            Self::Warn => "Warn",
            Self::Timeout => "Timeout",
            Self::Ban => "Ban",
            Self::Dismiss => "Dismiss",
            Self::Actioned => "Mark actioned",
        }
    }

    /// The phrase used in the in-channel audit line, so the record reads as an event.
    #[must_use]
    pub const fn past_tense(self) -> &'static str {
        match self {
            Self::DeleteMessage => "deleted the reported message",
            Self::Warn => "warned the reported user",
            Self::Timeout => "timed out the reported user",
            Self::Ban => "banned the reported user",
            Self::Dismiss => "dismissed the report",
            Self::Actioned => "marked the report actioned",
        }
    }

    /// The Discord permission a member must hold for this action to be applied. Mirrors the
    /// `default_member_permissions` on the equivalent slash command.
    #[must_use]
    pub const fn required_permission(self) -> Permissions {
        match self {
            Self::DeleteMessage | Self::Dismiss | Self::Actioned => Permissions::MANAGE_MESSAGES,
            Self::Warn | Self::Timeout => Permissions::MODERATE_MEMBERS,
            Self::Ban => Permissions::BAN_MEMBERS,
        }
    }

    /// Whether the action collects a reason or a duration from the moderator before it runs.
    #[must_use]
    pub const fn needs_input(self) -> bool {
        matches!(self, Self::Warn | Self::Timeout | Self::Ban | Self::Dismiss)
    }

    /// The report status this action settles on, if it settles the report at all.
    #[must_use]
    pub const fn resulting_status(self) -> Option<ReportStatus> {
        match self {
            Self::Dismiss => Some(ReportStatus::Dismissed),
            Self::Actioned => Some(ReportStatus::Actioned),
            Self::DeleteMessage | Self::Warn | Self::Timeout | Self::Ban => None,
        }
    }
}

/// The column a report action records its effect in.
#[derive(Debug)]
pub enum ReportUpdate {
    MessageDeleted,
    UserWarned,
    UserTimedOut,
    UserBanned,
}

/// A boolean flag that serializes to/from a plain JSON boolean.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ReportFlag(bool);

impl ReportFlag {
    pub const fn is_set(self) -> bool {
        self.0
    }
}

impl From<bool> for ReportFlag {
    fn from(value: bool) -> Self {
        Self(value)
    }
}

impl From<ReportFlag> for bool {
    fn from(flag: ReportFlag) -> Self {
        flag.0
    }
}

#[serde_as]
#[derive(Deserialize, Debug)]
#[serde(tag = "action", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DashboardAction {
    ResolveReport {
        status: ReportStatus,
    },
    DeleteMessage {
        #[serde_as(as = "DisplayFromStr")]
        channel_id: ChannelId,
        #[serde_as(as = "DisplayFromStr")]
        message_id: MessageId,
    },
    WarnUser,
    TimeoutUser,
    BanUser,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "report_status", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReportStatus {
    UnderReview,
    Actioned,
    Dismissed,
}

impl ReportStatus {
    /// The human-readable label, for user-facing strings. The serde and sqlx names are
    /// `SCREAMING_SNAKE_CASE` and read badly in a sentence.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::UnderReview => "Under Review",
            Self::Actioned => "Actioned",
            Self::Dismissed => "Dismissed",
        }
    }
}

/// Config for the reporting feature.
#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct ReportConfig {
    /// Whether reporting is enabled in the guild.
    pub enabled: bool,
    /// Message sent to the reporter when a report is resolved.
    pub resolved_dm: Option<TogglableMessage>,
    /// Message sent to the reporter when a report is dismissed.
    pub dismissed_dm: Option<TogglableMessage>,
    /// The reporting channel, if any.,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub reporting_channel: Option<ChannelId>,
}

#[derive(Deserialize, Debug)]
pub struct DashboardCommand {
    #[serde(flatten)]
    pub action: DashboardAction,
    pub report_id: i64,
    pub moderator_id: Option<UserId>,
    pub reason: Option<String>,
    pub duration_mins: Option<u64>,
    pub name: Option<String>,
}

/// Payload describing a reported message for the dashboard.
#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportedMessagePayload {
    /// ID of the report row.
    pub id: i64,
    /// ID of the guild the report belongs to.
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: GuildId,
    /// ID of the channel the reported message was in.
    #[serde_as(as = "DisplayFromStr")]
    pub channel_id: ChannelId,
    /// ID of the reported message.
    #[serde_as(as = "DisplayFromStr")]
    pub message_id: MessageId,
    /// ID of the reported message's author.
    #[serde_as(as = "DisplayFromStr")]
    pub author_id: UserId,
    /// Username of the reported message's author.
    #[serde(default)]
    pub author_name: String,
    /// ID of the user who filed the report.
    #[serde_as(as = "DisplayFromStr")]
    pub reporter_id: UserId,
    /// Username of the user who filed the report.
    #[serde(default)]
    pub reporter_name: String,
    /// Reason given for the report.
    pub reason: String,
    /// Content of the reported message.
    pub content: String,
    /// URL of an attachment on the reported message, if any.
    pub attachment_url: Option<String>,
    /// Current status of the report.
    pub status: ReportStatus,
    /// Whether the reported message was deleted.
    pub message_deleted: ReportFlag,
    /// Whether the author was warned.
    pub user_warned: ReportFlag,
    /// Whether the author was timed out.
    pub user_timed_out: ReportFlag,
    /// Whether the author was banned.
    pub user_banned: ReportFlag,
}
