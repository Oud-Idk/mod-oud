//! The control law. Pure functions over counts and config, so the whole decision is testable
//! without Redis or Discord.

use crate::features::dynamic_slowmode::types::{
    DynamicSlowmodeConfig, LADDER, MAX_SLOWMODE_SECS, MIN_EDIT_INTERVAL_SECS,
};

/// Ladder position of `secs`, rounding down.
///
/// A value between rungs maps to the rung below it, so a hand-set 45s is treated as 30s.
#[must_use]
pub fn rung_index(secs: u16) -> usize {
    LADDER
        .iter()
        .rposition(|&rung| rung <= secs)
        .unwrap_or_default()
}

/// Highest ladder position the policy's ceiling allows.
fn ceiling_index(ceiling_secs: u16) -> usize {
    rung_index(ceiling_secs.min(MAX_SLOWMODE_SECS))
}

/// How many thresholds `count` clears.
fn rungs_cleared(count: u32, thresholds: &[u32]) -> usize {
    thresholds.iter().filter(|&&limit| count >= limit).count()
}

/// The rung the current traffic asks for, before hysteresis.
///
/// Authors and volume combine with `max`, so either can raise the target and neither holds it back.
#[must_use]
pub fn target_secs(config: &DynamicSlowmodeConfig, authors: u32, volume: u32) -> u16 {
    let authors_rung = rungs_cleared(authors, &config.author_thresholds);
    let volume_rung = rungs_cleared(volume, &config.volume_thresholds);

    let wanted = authors_rung.max(volume_rung);
    let index = wanted
        .min(config.usable_rungs() - 1)
        .min(ceiling_index(config.ceiling_secs));

    LADDER[index]
}

/// One rung down, never below zero.
fn decay_one_rung(current: u16) -> u16 {
    LADDER[rung_index(current).saturating_sub(1)]
}

/// The value to write, given what the channel is at now.
///
/// Raises straight to the target; drops exactly one rung per call, paced by the edit interval.
#[must_use]
pub fn next_secs(config: &DynamicSlowmodeConfig, current: u16, authors: u32, volume: u32) -> u16 {
    let target = target_secs(config, authors, volume);

    if target >= current {
        return target;
    }

    target.max(decay_one_rung(current))
}

/// Whether enough time has passed to edit `last_edit_at` again.
#[must_use]
pub fn is_due(
    last_edit_at: chrono::DateTime<chrono::Utc>,
    now: chrono::DateTime<chrono::Utc>,
) -> bool {
    (now - last_edit_at).num_seconds() >= MIN_EDIT_INTERVAL_SECS
}

/// Whether `target` is the highest rung the policy allows.
///
/// Used to report a channel that is pinned at the ceiling, not merely one that happens to be high.
#[must_use]
pub fn is_at_ceiling(config: &DynamicSlowmodeConfig, target: u16) -> bool {
    let highest = ceiling_index(config.ceiling_secs).min(config.usable_rungs() - 1);
    highest > 0 && rung_index(target) == highest
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeDelta, Utc};

    fn config() -> DynamicSlowmodeConfig {
        DynamicSlowmodeConfig::default()
    }

    #[test]
    fn rung_index_rounds_down_to_the_rung_below() {
        assert_eq!(rung_index(0), 0);
        assert_eq!(rung_index(4), 0);
        assert_eq!(rung_index(5), 1);
        assert_eq!(rung_index(45), 4);
        assert_eq!(rung_index(600), 8);
        assert_eq!(rung_index(u16::MAX), 8);
    }

    #[test]
    fn quiet_traffic_asks_for_nothing() {
        assert_eq!(target_secs(&config(), 0, 0), 0);
        assert_eq!(target_secs(&config(), 3, 15), 0);
    }

    #[test]
    fn each_author_threshold_moves_one_rung() {
        let config = config();
        assert_eq!(target_secs(&config, 4, 0), 5);
        assert_eq!(target_secs(&config, 6, 0), 10);
        assert_eq!(target_secs(&config, 9, 0), 15);
        assert_eq!(target_secs(&config, 30, 0), 300);
    }

    #[test]
    fn volume_can_raise_the_target_but_never_lower_it() {
        let config = config();

        // 5 authors alone asks for 5s; 38 messages asks for 15s.
        assert_eq!(target_secs(&config, 5, 38), 15);

        // Many messages from few authors is a flood, so volume wins.
        assert_eq!(target_secs(&config, 1, 78), 60);

        // Many authors with no volume still counts.
        assert_eq!(target_secs(&config, 24, 0), 120);
    }

    #[test]
    fn ceiling_caps_the_target() {
        let mut config = config();
        config.ceiling_secs = 15;

        assert_eq!(target_secs(&config, 40, 200), 15);
    }

    #[test]
    fn ceiling_between_rungs_uses_the_rung_below() {
        let mut config = config();
        config.ceiling_secs = 45;

        assert_eq!(target_secs(&config, 40, 200), 30);
    }

    #[test]
    fn ceiling_above_the_max_stays_within_the_ladder() {
        let mut config = config();
        config.ceiling_secs = u16::MAX;

        assert_eq!(target_secs(&config, u32::MAX, u32::MAX), 600);
    }

    #[test]
    fn mismatched_threshold_lists_use_the_shorter_one() {
        let mut config = config();
        config.author_thresholds = vec![1, 2];
        config.volume_thresholds = vec![1, 2, 3, 4];

        assert_eq!(config.usable_rungs(), 3);
        assert_eq!(target_secs(&config, 100, 0), 10);
    }

    #[test]
    fn raising_is_immediate() {
        assert_eq!(next_secs(&config(), 5, 30, 0), 300);
    }

    #[test]
    fn decay_drops_one_rung_per_call() {
        let config = config();

        assert_eq!(next_secs(&config, 60, 0, 0), 30);
        assert_eq!(next_secs(&config, 30, 0, 0), 15);
        assert_eq!(next_secs(&config, 15, 0, 0), 10);
    }

    #[test]
    fn decay_never_goes_below_zero() {
        assert_eq!(next_secs(&config(), 5, 0, 0), 0);
        assert_eq!(next_secs(&config(), 0, 0, 0), 0);
    }

    #[test]
    fn decay_stops_at_one_rung_even_when_traffic_asks_for_less() {
        let config = config();

        // 10 authors asks for 15s, but a single step can only take 60s to 30s. The rest takes more
        // ticks, which is what keeps a channel flapping around a threshold from slamming down.
        assert_eq!(next_secs(&config, 60, 10, 0), 30);
        assert_eq!(next_secs(&config, 30, 10, 0), 15);
    }

    #[test]
    fn holding_steady_is_not_an_edit() {
        // 9 authors and 38 messages both ask for 15s, which is where the channel already is.
        assert_eq!(next_secs(&config(), 15, 9, 38), 15);
    }

    #[test]
    fn is_due_respects_the_minimum_interval() {
        let now = Utc::now();

        assert!(!is_due(now, now));
        assert!(!is_due(
            now - TimeDelta::seconds(MIN_EDIT_INTERVAL_SECS - 1),
            now
        ));
        assert!(is_due(
            now - TimeDelta::seconds(MIN_EDIT_INTERVAL_SECS),
            now
        ));
    }

    #[test]
    fn ceiling_reports_only_the_highest_allowed_rung() {
        let config = config();

        // Default ceiling is 300s, so 300 is the ceiling and 60 is not.
        assert!(is_at_ceiling(&config, 300));
        assert!(!is_at_ceiling(&config, 60));
        assert!(!is_at_ceiling(&config, 0));
    }

    #[test]
    fn a_zero_ceiling_is_never_a_ceiling_hit() {
        let mut config = config();
        config.ceiling_secs = 0;

        assert!(!is_at_ceiling(&config, 0));
    }
}
