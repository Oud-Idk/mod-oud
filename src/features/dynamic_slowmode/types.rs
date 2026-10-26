use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{ChannelId, GuildId};

/// Slowmode values the bot may write, in seconds.
///
/// The values Discord's own channel UI offers, so an admin can reproduce any of them by hand.
pub const LADDER: [u16; 9] = [0, 5, 10, 15, 30, 60, 120, 300, 600];

/// Discord rejects anything above six hours.
pub const MAX_SLOWMODE_SECS: u16 = 21_600;

/// Shortest interval between two edits to the same channel, and therefore the decay cadence.
///
/// The channel-edit sublimit is undocumented and serenity cannot see it.
pub const MIN_EDIT_INTERVAL_SECS: i64 = 300;

/// How long a channel is benched after a 429.
pub const RATE_LIMIT_BENCH_SECS: i64 = 900;

/// How many channels one tick may edit, so a burst spreads over several ticks.
pub const MAX_EDITS_PER_TICK: usize = 10;

/// Guild-level policy for dynamic slowmode.
#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DynamicSlowmodeConfig {
    /// Whether the feature runs at all.
    pub enabled: bool,

    /// Channels the admin opted in. Nothing outside this list is ever edited.
    #[serde(default)]
    #[serde_as(as = "Vec<DisplayFromStr>")]
    pub channels: Vec<ChannelId>,

    /// Highest rung the bot will write, regardless of how hot the channel is.
    pub ceiling_secs: u16,

    /// Distinct authors needed for each rung above 0, so `len() == LADDER.len() - 1`.
    pub author_thresholds: Vec<u32>,

    /// Messages needed for each rung above 0, so `len() == LADDER.len() - 1`.
    pub volume_thresholds: Vec<u32>,

    /// Measurement window, in seconds.
    pub window_secs: u64,
}

impl Default for DynamicSlowmodeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            channels: Vec::new(),
            ceiling_secs: 300,
            author_thresholds: vec![4, 6, 9, 13, 18, 24, 30, 40],
            volume_thresholds: vec![16, 26, 38, 56, 78, 104, 130, 170],
            window_secs: 60,
        }
    }
}

impl DynamicSlowmodeConfig {
    /// Number of rungs this policy can reach, ignoring the ceiling.
    ///
    /// Mismatched threshold lists resolve to the shorter, so a hand-edited config cannot panic the tick.
    #[must_use]
    pub fn usable_rungs(&self) -> usize {
        1 + self
            .author_thresholds
            .len()
            .min(self.volume_thresholds.len())
    }
}

/// What the bot is doing to one channel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlowmodeChannelState {
    /// The channel this row describes.
    pub channel_id: ChannelId,
    /// Guild the channel belongs to.
    pub guild_id: GuildId,
    /// The slowmode the channel had before the bot first touched it.
    pub pre_automation_secs: u16,
    /// The value the bot last wrote.
    pub last_written_secs: u16,
    /// When the bot last edited the channel, used for pacing and decay.
    pub last_edit_at: chrono::DateTime<chrono::Utc>,
    /// When the channel was armed.
    pub armed_at: chrono::DateTime<chrono::Utc>,
    /// `None` while the bot is driving the channel.
    pub disarmed_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Why the bot stopped, if it did.
    pub disarm_reason: Option<String>,
}

impl SlowmodeChannelState {
    /// Whether the bot is currently allowed to edit this channel.
    #[must_use]
    pub const fn is_armed(&self) -> bool {
        self.disarmed_at.is_none()
    }
}

/// Why a channel stopped being automated.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DisarmReason {
    /// A human changed the slowmode by hand.
    HumanEdit,
}

impl DisarmReason {
    /// Stable string stored in `disarm_reason`.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::HumanEdit => "HUMAN_EDIT",
        }
    }
}
