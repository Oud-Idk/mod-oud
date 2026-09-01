use crate::features::gambling::games::cards::Rank;

/// Player's guess for the next card relative to the current card.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Guess {
    Higher,
    Lower,
}

impl Guess {
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Higher => "Higher",
            Self::Lower => "Lower",
        }
    }
}

/// Returns `true` if `next` satisfies `guess` relative to `current`.
///
/// Ties (equal order value) are always losses for the player (house wins).
#[must_use]
pub const fn is_correct(current: Rank, next: Rank, guess: Guess) -> bool {
    let cur = current.order_value();
    let next_rank = next.order_value();
    match guess {
        Guess::Higher => next_rank > cur,
        Guess::Lower => next_rank < cur,
    }
}

/// Total amount returned to the player on cash-out (includes original stake).
///
/// - `streak == 0` → push, returns the original bet
/// - `streak >= 1` → linear escalator `bet * (streak + 1)`
///   e.g. bet 100, streak 1 → 200 (profit 100), streak 3 → 400 (profit 300)
///
/// Returns `None` on overflow (caller should treat as error).
#[must_use]
pub fn payout_for_streak(bet: i64, streak: u32) -> Option<i64> {
    bet.checked_mul(i64::from(streak) + 1)
}

/// Profit only (payout minus original stake). Returns `None` on overflow.
#[must_use]
#[allow(dead_code)]
pub fn profit_for_streak(bet: i64, streak: u32) -> Option<i64> {
    payout_for_streak(bet, streak)?.checked_sub(bet)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::gambling::games::cards::Rank;

    #[test]
    fn test_order_value_ace_high() {
        assert!(Rank::Ace.order_value() > Rank::King.order_value());
        assert!(Rank::Two.order_value() < Rank::Three.order_value());
        assert_eq!(Rank::Jack.order_value(), 11);
        assert_eq!(Rank::Ace.order_value(), 14);
    }

    #[test]
    fn test_is_correct_higher() {
        assert!(is_correct(Rank::Five, Rank::Six, Guess::Higher));
        assert!(!is_correct(Rank::Five, Rank::Four, Guess::Higher));
        // Tie is a loss
        assert!(!is_correct(Rank::Seven, Rank::Seven, Guess::Higher));
        assert!(!is_correct(Rank::Ace, Rank::Ace, Guess::Higher));
        // Ace high cannot be beaten
        assert!(!is_correct(Rank::Ace, Rank::King, Guess::Higher));
    }

    #[test]
    fn test_is_correct_lower() {
        assert!(is_correct(Rank::Eight, Rank::Seven, Guess::Lower));
        assert!(!is_correct(Rank::Eight, Rank::Nine, Guess::Lower));
        assert!(!is_correct(Rank::Three, Rank::Three, Guess::Lower));
        // Two is lowest
        assert!(!is_correct(Rank::Two, Rank::Three, Guess::Lower));
        assert!(is_correct(Rank::Ace, Rank::King, Guess::Lower));
    }

    #[test]
    fn test_payout_for_streak() {
        assert_eq!(payout_for_streak(100, 0), Some(100));
        assert_eq!(payout_for_streak(100, 1), Some(200));
        assert_eq!(payout_for_streak(100, 3), Some(400));
        assert_eq!(payout_for_streak(50, 2), Some(150));
        assert_eq!(profit_for_streak(100, 0), Some(0));
        assert_eq!(profit_for_streak(100, 1), Some(100));
        assert_eq!(profit_for_streak(100, 5), Some(500));
    }

    #[test]
    fn test_payout_overflow() {
        assert_eq!(payout_for_streak(i64::MAX, 1), None);
    }
}
