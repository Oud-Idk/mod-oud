use rand::RngExt;

/// A single slot symbol.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Symbol {
    /// Cherry
    Cherry,
    /// Lemon
    Lemon,
    /// Orange
    Orange,
    /// Bell
    Bell,
    /// Seven
    Seven,
}

impl Symbol {
    /// All symbols in definition order.
    pub const ALL: [Self; 5] = [Self::Cherry, Self::Lemon, Self::Orange, Self::Bell, Self::Seven];

    /// Emoji representation for embeds.
    #[must_use]
    pub const fn emoji(self) -> &'static str {
        match self {
            Self::Cherry => "🍒",
            Self::Lemon => "🍋",
            Self::Orange => "🍊",
            Self::Bell => "🔔",
            Self::Seven => "7️⃣",
        }
    }

    /// Human-readable label.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Cherry => "Cherry",
            Self::Lemon => "Lemon",
            Self::Orange => "Orange",
            Self::Bell => "Bell",
            Self::Seven => "Seven",
        }
    }

    /// Weight for weighted random selection. Total = 100.
    #[must_use]
    pub const fn weight(self) -> u32 {
        match self {
            Self::Cherry => 30,
            Self::Lemon => 25,
            Self::Orange => 20,
            Self::Bell => 15,
            Self::Seven => 10,
        }
    }

    /// Payout multiplier for three-of-a-kind (total return, includes stake).
    #[must_use]
    pub const fn three_of_a_kind_multiplier(self) -> i64 {
        match self {
            Self::Cherry => 5,
            Self::Lemon => 8,
            Self::Orange => 15,
            Self::Bell => 25,
            Self::Seven => 50,
        }
    }
}

/// Total weight across all symbols (30+25+20+15+10 = 100).
pub const TOTAL_WEIGHT: u32 = 100;

/// Result of a spin (ltr).
pub type Reels = [Symbol; 3];

/// Spin three reels with weighted odds.
#[must_use]
pub fn spin() -> Reels {
    [random_symbol(), random_symbol(), random_symbol()]
}

fn random_symbol() -> Symbol {
    let mut rng = rand::rng();
    let roll = rng.random_range(0..TOTAL_WEIGHT);
    let mut cumulative = 0;
    for sym in Symbol::ALL {
        cumulative += sym.weight();
        if roll < cumulative {
            return sym;
        }
    }
    // Fallback
    Symbol::Seven
}

/// Outcome category for display.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WinTier {
    /// Three matching symbols.
    ThreeOfAKind(Symbol),
    /// First two reels match (any symbol).
    TwoOfAKind(Symbol),
    /// No win.
    Loss,
}

impl WinTier {
    /// Multiplier for this tier (total return). `Loss` => 0.
    #[must_use]
    pub const fn multiplier(self) -> i64 {
        match self {
            Self::ThreeOfAKind(sym) => sym.three_of_a_kind_multiplier(),
            Self::TwoOfAKind(_) => 2,
            Self::Loss => 0,
        }
    }

    /// Human-readable description.
    #[must_use]
    pub fn display(self) -> String {
        match self {
            Self::ThreeOfAKind(sym) => format!("Three {} {}!", sym.label(), sym.emoji()),
            Self::TwoOfAKind(sym) => format!("Two {} {}", sym.label(), sym.emoji()),
            Self::Loss => "No match".to_string(),
        }
    }
}

/// Evaluate reels and return the win tier.
///
/// Priority: `ThreeOfAKind` > `TwoOfAKind` (first two match) > `Loss`.
#[must_use]
pub fn evaluate(reels: Reels) -> WinTier {
    if reels[0] == reels[1] && reels[1] == reels[2] {
        return WinTier::ThreeOfAKind(reels[0]);
    }
    if reels[0] == reels[1] {
        return WinTier::TwoOfAKind(reels[0]);
    }
    WinTier::Loss
}

/// Total payout (includes stake) for `reels` and `stake`. Returns `Some(0)` on loss,
/// `None` on overflow.
#[must_use]
pub fn payout_for(reels: Reels, stake: i64) -> Option<i64> {
    let tier = evaluate(reels);
    if tier == WinTier::Loss {
        return Some(0);
    }
    stake.checked_mul(tier.multiplier())
}

/// Format reels as `🍒 | 🍋 | 🔔`.
#[must_use]
pub fn format_reels(reels: Reels) -> String {
    format!(
        "{} | {} | {}",
        reels[0].emoji(),
        reels[1].emoji(),
        reels[2].emoji()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_weights_sum_to_total() {
        let sum: u32 = Symbol::ALL.iter().map(|s| s.weight()).sum();
        assert_eq!(sum, TOTAL_WEIGHT);
    }

    #[test]
    fn test_evaluate_three_of_a_kind() {
        assert_eq!(
            evaluate([Symbol::Cherry, Symbol::Cherry, Symbol::Cherry]),
            WinTier::ThreeOfAKind(Symbol::Cherry)
        );
        assert_eq!(
            evaluate([Symbol::Seven, Symbol::Seven, Symbol::Seven]),
            WinTier::ThreeOfAKind(Symbol::Seven)
        );
        assert_eq!(
            evaluate([Symbol::Bell, Symbol::Bell, Symbol::Bell]),
            WinTier::ThreeOfAKind(Symbol::Bell)
        );
    }

    #[test]
    fn test_evaluate_two_of_a_kind() {
        assert_eq!(
            evaluate([Symbol::Cherry, Symbol::Cherry, Symbol::Bell]),
            WinTier::TwoOfAKind(Symbol::Cherry)
        );
        assert_eq!(
            evaluate([Symbol::Seven, Symbol::Seven, Symbol::Cherry]),
            WinTier::TwoOfAKind(Symbol::Seven)
        );
        // Third matches second but not first
        assert_eq!(
            evaluate([Symbol::Cherry, Symbol::Lemon, Symbol::Lemon]),
            WinTier::Loss
        );
    }

    #[test]
    fn test_evaluate_loss() {
        assert_eq!(
            evaluate([Symbol::Cherry, Symbol::Lemon, Symbol::Orange]),
            WinTier::Loss
        );
        assert_eq!(
            evaluate([Symbol::Seven, Symbol::Bell, Symbol::Seven]),
            WinTier::Loss
        );
    }

    #[test]
    fn test_payout_three_of_a_kind() {
        assert_eq!(
            payout_for([Symbol::Cherry, Symbol::Cherry, Symbol::Cherry], 100),
            Some(500)
        );
        assert_eq!(
            payout_for([Symbol::Seven, Symbol::Seven, Symbol::Seven], 100),
            Some(5000)
        );
        assert_eq!(
            payout_for([Symbol::Bell, Symbol::Bell, Symbol::Bell], 100),
            Some(2500)
        );
        assert_eq!(
            payout_for([Symbol::Lemon, Symbol::Lemon, Symbol::Lemon], 100),
            Some(800)
        );
        assert_eq!(
            payout_for([Symbol::Orange, Symbol::Orange, Symbol::Orange], 100),
            Some(1500)
        );
    }

    #[test]
    fn test_payout_two_of_a_kind() {
        assert_eq!(
            payout_for([Symbol::Cherry, Symbol::Cherry, Symbol::Lemon], 100),
            Some(200)
        );
        assert_eq!(
            payout_for([Symbol::Seven, Symbol::Seven, Symbol::Cherry], 50),
            Some(100)
        );
    }

    #[test]
    fn test_payout_loss() {
        assert_eq!(
            payout_for([Symbol::Cherry, Symbol::Lemon, Symbol::Orange], 100),
            Some(0)
        );
    }

    #[test]
    fn test_payout_overflow() {
        assert_eq!(
            payout_for([Symbol::Seven, Symbol::Seven, Symbol::Seven], i64::MAX),
            None
        );
    }

    #[test]
    fn test_spin_produces_valid_symbols() {
        for _ in 0..100 {
            let reels = spin();
            for sym in reels {
                assert!(Symbol::ALL.contains(&sym));
            }
        }
    }

    #[test]
    fn test_format_reels() {
        let s = format_reels([Symbol::Cherry, Symbol::Lemon, Symbol::Bell]);
        assert_eq!(s, "🍒 | 🍋 | 🔔");
    }
}
