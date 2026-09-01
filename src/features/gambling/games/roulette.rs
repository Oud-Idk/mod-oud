use rand::RngExt;

/// European roulette pocket 0-36.
pub const POCKETS: u8 = 37;

/// Red numbers on a European wheel.
const REDS: [u8; 18] = [
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
];

/// A parsed roulette bet.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RouletteBet {
    /// Straight-up single number 0-36, pays 35:1
    Straight(u8),
    Even,
    Odd,
    Red,
    Black,
    /// Dozen 1 = 1-12, 2 = 13-24, 3 = 25-36, pays 2:1
    Dozen(u8),
}

impl RouletteBet {
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Straight(n) => match n {
                0 => "0",
                1 => "1",
                2 => "2",
                3 => "3",
                4 => "4",
                5 => "5",
                6 => "6",
                7 => "7",
                8 => "8",
                9 => "9",
                10 => "10",
                11 => "11",
                12 => "12",
                13 => "13",
                14 => "14",
                15 => "15",
                16 => "16",
                17 => "17",
                18 => "18",
                19 => "19",
                20 => "20",
                21 => "21",
                22 => "22",
                23 => "23",
                24 => "24",
                25 => "25",
                26 => "26",
                27 => "27",
                28 => "28",
                29 => "29",
                30 => "30",
                31 => "31",
                32 => "32",
                33 => "33",
                34 => "34",
                35 => "35",
                _ => "36",
            },
            Self::Even => "Even",
            Self::Odd => "Odd",
            Self::Red => "Red",
            Self::Black => "Black",
            Self::Dozen(1) => "1st (1-12)",
            Self::Dozen(2) => "2nd (13-24)",
            Self::Dozen(3) => "3rd (25-36)",
            Self::Dozen(_) => "Dozen",
        }
    }

    /// Display for the bet as the user typed it, for embeds.
    #[must_use]
    pub fn display(self) -> String {
        self.label().to_string()
    }

    /// Payout multiplier as total return (includes stake).
    /// Straight 35:1 => 36x, Dozen 2:1 => 3x, Even/Odd/Red/Black 1:1 => 2x
    #[must_use]
    pub const fn payout_multiplier(self) -> i64 {
        match self {
            Self::Straight(_) => 36,
            Self::Dozen(_) => 3,
            Self::Even | Self::Odd | Self::Red | Self::Black => 2,
        }
    }
}

/// Returns true if `n` is red on a European wheel.
#[must_use]
pub fn is_red(n: u8) -> bool {
    REDS.contains(&n)
}

/// Returns true if `n` is black (1-36 and not red). 0 is green.
#[must_use]
pub fn is_black(n: u8) -> bool {
    n != 0 && !is_red(n)
}

/// Spin the wheel: uniform 0-36.
#[must_use]
pub fn spin() -> u8 {
    rand::rng().random_range(0..POCKETS)
}

/// Returns true if `bet` wins on `winning` pocket.
#[must_use]
pub fn is_win(bet: RouletteBet, winning: u8) -> bool {
    match bet {
        RouletteBet::Straight(n) => n == winning,
        RouletteBet::Even => winning != 0 && winning % 2 == 0,
        RouletteBet::Odd => winning % 2 == 1,
        RouletteBet::Red => is_red(winning),
        RouletteBet::Black => is_black(winning),
        RouletteBet::Dozen(1) => (1..=12).contains(&winning),
        RouletteBet::Dozen(2) => (13..=24).contains(&winning),
        RouletteBet::Dozen(3) => (25..=36).contains(&winning),
        RouletteBet::Dozen(_) => false,
    }
}

/// Total payout (includes stake) if bet wins, else 0. Returns `None` on overflow.
#[must_use]
pub fn payout_for(bet: RouletteBet, winning: u8, stake: i64) -> Option<i64> {
    if !is_win(bet, winning) {
        return Some(0);
    }
    stake.checked_mul(bet.payout_multiplier())
}

/// Parse `input` (the `<space>` arg) into a `RouletteBet`.
///
/// Accepts (case-insensitive, trimmed):
/// - `0`..`36` straight
/// - `odd` / `even`
/// - `red` / `black`
/// - `1st` / `1st dozen` / `1-12` -> Dozen 1, similarly `2nd`/`13-24`, `3rd`/`25-36`
///
/// Returns `None` on invalid input.
#[must_use]
pub fn parse_space(input: &str) -> Option<RouletteBet> {
    let s = input.trim().to_ascii_lowercase();

    // Straight number
    if let Ok(n) = s.parse::<u8>() {
        if n < POCKETS {
            return Some(RouletteBet::Straight(n));
        }
        return None;
    }

    match s.as_str() {
        "odd" => return Some(RouletteBet::Odd),
        "even" => return Some(RouletteBet::Even),
        "red" => return Some(RouletteBet::Red),
        "black" => return Some(RouletteBet::Black),
        "1st" | "1st dozen" | "1-12" | "1 - 12" | "first" => return Some(RouletteBet::Dozen(1)),
        "2nd" | "2nd dozen" | "13-24" | "13 - 24" | "second" => {
            return Some(RouletteBet::Dozen(2))
        }
        "3rd" | "3rd dozen" | "25-36" | "25 - 36" | "third" => return Some(RouletteBet::Dozen(3)),
        _ => {}
    }

    // Allow "1st 12" etc with extra spaces? already trimmed lowercase, handle optional "dozen" prefix
    // Already covered.

    None
}

/// Color label for a pocket: "Red", "Black", "Green".
#[must_use]
pub fn pocket_color(winning: u8) -> &'static str {
    if winning == 0 {
        "Green"
    } else if is_red(winning) {
        "Red"
    } else {
        "Black"
    }
}

/// Emoji for pocket color.
#[must_use]
pub fn pocket_emoji(winning: u8) -> &'static str {
    if winning == 0 {
        "🟢"
    } else if is_red(winning) {
        "🔴"
    } else {
        "⚫"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_straight() {
        assert_eq!(parse_space("16"), Some(RouletteBet::Straight(16)));
        assert_eq!(parse_space("0"), Some(RouletteBet::Straight(0)));
        assert_eq!(parse_space("36"), Some(RouletteBet::Straight(36)));
        assert_eq!(parse_space("37"), None);
        assert_eq!(parse_space(" 16 "), Some(RouletteBet::Straight(16)));
    }

    #[test]
    fn test_parse_word_bets() {
        assert_eq!(parse_space("odd"), Some(RouletteBet::Odd));
        assert_eq!(parse_space("Odd"), Some(RouletteBet::Odd));
        assert_eq!(parse_space("EVEN"), Some(RouletteBet::Even));
        assert_eq!(parse_space("red"), Some(RouletteBet::Red));
        assert_eq!(parse_space("black"), Some(RouletteBet::Black));
    }

    #[test]
    fn test_parse_dozens() {
        assert_eq!(parse_space("1st"), Some(RouletteBet::Dozen(1)));
        assert_eq!(parse_space("2nd"), Some(RouletteBet::Dozen(2)));
        assert_eq!(parse_space("3rd"), Some(RouletteBet::Dozen(3)));
        assert_eq!(parse_space("1-12"), Some(RouletteBet::Dozen(1)));
        assert_eq!(parse_space("13-24"), Some(RouletteBet::Dozen(2)));
        assert_eq!(parse_space("25-36"), Some(RouletteBet::Dozen(3)));
        assert_eq!(parse_space("1st dozen"), Some(RouletteBet::Dozen(1)));
    }

    #[test]
    fn test_is_win_straight() {
        assert!(is_win(RouletteBet::Straight(16), 16));
        assert!(!is_win(RouletteBet::Straight(16), 15));
    }

    #[test]
    fn test_is_win_even_odd() {
        assert!(is_win(RouletteBet::Even, 2));
        assert!(!is_win(RouletteBet::Even, 0));
        assert!(!is_win(RouletteBet::Even, 3));
        assert!(is_win(RouletteBet::Odd, 3));
        assert!(!is_win(RouletteBet::Odd, 2));
        assert!(!is_win(RouletteBet::Odd, 0));
    }

    #[test]
    fn test_is_win_color() {
        assert!(is_win(RouletteBet::Red, 1));
        assert!(!is_win(RouletteBet::Red, 2));
        assert!(!is_win(RouletteBet::Red, 0));
        assert!(is_win(RouletteBet::Black, 2));
        assert!(!is_win(RouletteBet::Black, 1));
    }

    #[test]
    fn test_is_win_dozen() {
        assert!(is_win(RouletteBet::Dozen(1), 1));
        assert!(is_win(RouletteBet::Dozen(1), 12));
        assert!(!is_win(RouletteBet::Dozen(1), 13));
        assert!(is_win(RouletteBet::Dozen(2), 13));
        assert!(is_win(RouletteBet::Dozen(2), 24));
        assert!(!is_win(RouletteBet::Dozen(2), 25));
        assert!(is_win(RouletteBet::Dozen(3), 36));
        assert!(!is_win(RouletteBet::Dozen(3), 0));
    }

    #[test]
    fn test_payout() {
        assert_eq!(payout_for(RouletteBet::Straight(16), 16, 100), Some(3600));
        assert_eq!(payout_for(RouletteBet::Straight(16), 15, 100), Some(0));
        assert_eq!(payout_for(RouletteBet::Dozen(2), 15, 100), Some(300));
        assert_eq!(payout_for(RouletteBet::Red, 1, 100), Some(200));
        assert_eq!(payout_for(RouletteBet::Odd, 3, 100), Some(200));
        assert_eq!(payout_for(RouletteBet::Red, 0, 100), Some(0));
    }

    #[test]
    fn test_spin_range() {
        for _ in 0..100 {
            let n = spin();
            assert!(n < POCKETS);
        }
    }
}
