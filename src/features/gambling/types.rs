use serde::{Deserialize, Serialize};

const fn default_gambling_enabled() -> bool {
    true
}
const fn default_gambling_cooldown_secs() -> i64 {
    0
}
const fn default_gambling_min_bet() -> i64 {
    10
}
const fn default_gambling_max_bet() -> i64 {
    0 // 0 = no cap
}
const fn default_gambling_timeout_secs() -> u64 {
    60
}
const fn default_game_enabled() -> bool {
    true
}

/// Blackjack sub-config (Tier 1: enabled only; payout/math stays hardcoded for now).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BlackjackConfig {
    /// Whether blackjack is enabled.
    #[serde(default = "default_game_enabled")]
    pub enabled: bool,
}

impl Default for BlackjackConfig {
    fn default() -> Self {
        Self {
            enabled: default_game_enabled(),
        }
    }
}

/// Slots sub-config (Tier 1).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SlotsConfig {
    /// Whether slots is enabled.
    #[serde(default = "default_game_enabled")]
    pub enabled: bool,
}

impl Default for SlotsConfig {
    fn default() -> Self {
        Self {
            enabled: default_game_enabled(),
        }
    }
}

/// Roulette sub-config (Tier 1).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RouletteConfig {
    /// Whether roulette is enabled.
    #[serde(default = "default_game_enabled")]
    pub enabled: bool,
}

impl Default for RouletteConfig {
    fn default() -> Self {
        Self {
            enabled: default_game_enabled(),
        }
    }
}

/// Higher/Lower sub-config (Tier 1).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HigherLowerConfig {
    /// Whether higher/lower is enabled.
    #[serde(default = "default_game_enabled")]
    pub enabled: bool,
}

impl Default for HigherLowerConfig {
    fn default() -> Self {
        Self {
            enabled: default_game_enabled(),
        }
    }
}

/// Coinflip sub-config (Tier 1).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CoinflipConfig {
    /// Whether coinflip is enabled.
    #[serde(default = "default_game_enabled")]
    pub enabled: bool,
}

impl Default for CoinflipConfig {
    fn default() -> Self {
        Self {
            enabled: default_game_enabled(),
        }
    }
}

// ---------------------------------------------------------------------------
// Top-level gambling config — stored as `GuildSettings.gambling`
// ---------------------------------------------------------------------------

/// Per-guild gambling configuration stored in `GuildSettings`.
///
/// Tier 1: master enable, global bet limits, global cooldown, interactive
/// timeout, and per-game enabled toggles. Payout math / weights are deferred
/// to Tier 2 and remain hardcoded in `games::*`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GamblingConfig {
    /// Whether any gambling command is available. When `false`, every game
    /// rejects with "Gambling is disabled in this server."
    #[serde(default = "default_gambling_enabled")]
    pub enabled: bool,

    /// Per-user cooldown in seconds applied after **any** gambling command
    /// completes (including losses and timeouts). `0` disables.
    #[serde(default = "default_gambling_cooldown_secs")]
    pub cooldown_secs: i64,

    /// Minimum bet allowed. Enforced alongside `bet > 0`.
    #[serde(default = "default_gambling_min_bet")]
    pub min_bet: i64,

    /// Maximum bet allowed. `0` means no cap. When `>0` must be `>= min_bet`.
    #[serde(default = "default_gambling_max_bet")]
    pub max_bet: i64,

    /// Seconds before an interactive game (blackjack / higher-lower) times out
    /// and forfeits the bet. Clamped to >= 10s in validation helpers.
    #[serde(default = "default_gambling_timeout_secs")]
    pub timeout_secs: u64,

    /// Blackjack game toggle.
    #[serde(default)]
    pub blackjack: BlackjackConfig,
    /// Coinflip game toggle.
    #[serde(default)]
    pub coinflip: CoinflipConfig,
    /// Slots game toggle.
    #[serde(default)]
    pub slots: SlotsConfig,
    /// Roulette game toggle.
    #[serde(default)]
    pub roulette: RouletteConfig,
    /// Higher/Lower game toggle.
    #[serde(default)]
    pub higherlower: HigherLowerConfig,
}

impl Default for GamblingConfig {
    fn default() -> Self {
        Self {
            enabled: default_gambling_enabled(),
            cooldown_secs: default_gambling_cooldown_secs(),
            min_bet: default_gambling_min_bet(),
            max_bet: default_gambling_max_bet(),
            timeout_secs: default_gambling_timeout_secs(),
            blackjack: BlackjackConfig::default(),
            coinflip: CoinflipConfig::default(),
            slots: SlotsConfig::default(),
            roulette: RouletteConfig::default(),
            higherlower: HigherLowerConfig::default(),
        }
    }
}

impl GamblingConfig {
    /// Effective interactive timeout, clamped to at least 10s.
    #[must_use]
    pub fn effective_timeout_secs(&self) -> u64 {
        self.timeout_secs.max(10)
    }

    /// Whether `game` (identified by its per-game `enabled`) is enabled,
    /// taking the master `enabled` into account.
    #[must_use]
    pub const fn is_game_enabled(&self, game_enabled: bool) -> bool {
        self.enabled && game_enabled
    }

    /// Validate `bet` against `min_bet`/`max_bet` (caller already checked `bet > 0`).
    /// Returns `None` if ok, else a user-facing reason.
    #[must_use]
    pub fn validate_bet(&self, bet: i64) -> Option<String> {
        if bet < self.min_bet {
            return Some(format!(
                "Minimum bet is **{}**. You wagered **{bet}**.",
                self.min_bet
            ));
        }
        if self.max_bet > 0 && bet > self.max_bet {
            return Some(format!(
                "Maximum bet is **{}**. You wagered **{bet}**.",
                self.max_bet
            ));
        }
        None
    }

    /// Quick structural check used only by dashboard validation / tests.
    /// `max_bet == 0` means uncapped and always passes.
    #[must_use]
    pub const fn bets_are_consistent(&self) -> bool {
        self.max_bet == 0 || self.max_bet >= self.min_bet
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_sane() {
        let cfg = GamblingConfig::default();
        assert!(cfg.enabled);
        assert_eq!(cfg.min_bet, 10);
        assert_eq!(cfg.max_bet, 0);
        assert_eq!(cfg.cooldown_secs, 0);
        assert_eq!(cfg.timeout_secs, 60);
        assert!(cfg.blackjack.enabled);
        assert!(cfg.higherlower.enabled);
    }

    #[test]
    fn serde_round_trip_with_missing_fields_uses_defaults() {
        let json = serde_json::json!({ "enabled": false });
        let cfg: GamblingConfig = serde_json::from_value(json).unwrap();
        assert!(!cfg.enabled);
        // missing fields fill via defaults
        assert_eq!(cfg.min_bet, 10);
        assert_eq!(cfg.timeout_secs, 60);
        assert!(cfg.blackjack.enabled); // per-game defaults still apply
    }

    #[test]
    fn validate_bet_respects_limits() {
        let cfg = GamblingConfig {
            min_bet: 10,
            max_bet: 100,
            ..Default::default()
        };
        assert!(cfg.validate_bet(10).is_none());
        assert!(cfg.validate_bet(100).is_none());
        assert!(cfg.validate_bet(5).is_some());
        assert!(cfg.validate_bet(101).is_some());
    }

    #[test]
    fn validate_bet_no_cap_when_zero() {
        let cfg = GamblingConfig {
            min_bet: 1,
            max_bet: 0,
            ..Default::default()
        };
        assert!(cfg.validate_bet(999_999).is_none());
    }

    #[test]
    fn bets_consistency() {
        let ok = GamblingConfig {
            min_bet: 10,
            max_bet: 5,
            ..Default::default()
        };
        assert!(!ok.bets_are_consistent());
        let uncapped = GamblingConfig {
            min_bet: 10,
            max_bet: 0,
            ..Default::default()
        };
        assert!(uncapped.bets_are_consistent());
    }

    #[test]
    fn effective_timeout_clamped() {
        let cfg = GamblingConfig {
            timeout_secs: 2,
            ..Default::default()
        };
        assert_eq!(cfg.effective_timeout_secs(), 10);
        let cfg2 = GamblingConfig {
            timeout_secs: 120,
            ..Default::default()
        };
        assert_eq!(cfg2.effective_timeout_secs(), 120);
    }
}
