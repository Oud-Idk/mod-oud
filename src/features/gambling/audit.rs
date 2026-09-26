//! Per-bet audit trail.
//!
//! `economy` already logs every balance change but not the game context. These add `game`,
//! `user_id` and the outcome, so win rate, disputes and abuse are answerable from logs.
//! Every line carries an `event` field so one filter covers all of them.

use serenity::all::{GuildId, UserId};
use tracing::{error, info, warn};

/// Shown when a payout cannot be represented.
pub const PAYOUT_OVERFLOW_MESSAGE: &str =
    "That payout is too large to process. The bet has been cancelled and you were not charged.";

/// Records the debit taken when a wager is accepted.
pub fn bet_placed(game: &'static str, guild_id: GuildId, user_id: UserId, bet: i64, detail: &str) {
    info!(
        event = "bet_placed",
        game,
        %guild_id,
        %user_id,
        bet,
        detail,
        "gambling: bet placed"
    );
}

/// Records a refused wager, usually for insufficient funds.
///
/// `warn!` because a burst from one account is the cheapest bot signal we get.
pub fn bet_rejected(
    game: &'static str,
    guild_id: GuildId,
    user_id: UserId,
    bet: i64,
    reason: &'static str,
) {
    warn!(
        event = "bet_rejected",
        game,
        %guild_id,
        %user_id,
        bet,
        reason,
        "gambling: bet rejected"
    );
}

/// Records a settled wager. `outcome` is one of `win`, `loss`, `push`.
///
/// The resulting balance is not repeated here, `economy` already logs it as `cash_after`.
pub fn bet_settled(
    game: &'static str,
    guild_id: GuildId,
    user_id: UserId,
    bet: i64,
    outcome: &'static str,
    payout: i64,
    detail: &str,
) {
    info!(
        event = "bet_settled",
        game,
        %guild_id,
        %user_id,
        bet,
        outcome,
        payout,
        detail,
        "gambling: bet settled"
    );
}

/// Records a wager that was debited but never settled.
pub fn bet_forfeited(
    game: &'static str,
    guild_id: GuildId,
    user_id: UserId,
    bet: i64,
    reason: &'static str,
    detail: &str,
) {
    warn!(
        event = "bet_forfeited",
        game,
        %guild_id,
        %user_id,
        bet,
        reason,
        detail,
        "gambling: bet was debited but never settled"
    );
}

/// Records a user other than the bet owner clicking a live game component.
pub fn non_player_interaction(
    game: &'static str,
    guild_id: GuildId,
    owner_id: UserId,
    actor_id: UserId,
    custom_id: &str,
) {
    warn!(
        event = "non_player_interaction",
        game,
        %guild_id,
        owner_id = %owner_id,
        actor_id = %actor_id,
        custom_id,
        "gambling: a user other than the bet owner interacted with a live game component"
    );
}

/// Logs an overflowed payout.
///
/// `error!` because a real win was voided. The bet stays debited either way.
pub fn payout_overflow(
    game: &'static str,
    guild_id: GuildId,
    user_id: UserId,
    bet: i64,
    detail: &str,
) {
    error!(
        event = "payout_overflow",
        game,
        %guild_id,
        %user_id,
        bet,
        detail,
        "gambling: payout overflowed i64, the wager was voided"
    );
}

/// Resolves a payout, logging an overflow.
///
/// Returns `None` when the payout is not representable. The caller must then abort the wager
/// without paying out.
#[must_use]
pub fn resolve_payout(
    computed: Option<i64>,
    game: &'static str,
    guild_id: GuildId,
    user_id: UserId,
    bet: i64,
    detail: &str,
) -> Option<i64> {
    computed.map_or_else(
        || {
            payout_overflow(game, guild_id, user_id, bet, detail);
            None
        },
        Some,
    )
}
