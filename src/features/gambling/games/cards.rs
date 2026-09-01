use rand::seq::SliceRandom;
use rand::rng;

pub const TARGET: u32 = 21;
pub const DEALER_LIMIT: u32 = 17;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Suit {
    Hearts,
    Diamonds,
    Clubs,
    Spades,
}

impl Suit {
    pub const ALL: [Self; 4] = [Self::Hearts, Self::Diamonds, Self::Clubs, Self::Spades];

    #[must_use]
    pub const fn symbol(self) -> &'static str {
        match self {
            Self::Hearts => "♥️",
            Self::Diamonds => "♦️",
            Self::Clubs => "♣️",
            Self::Spades => "♠️",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rank {
    Two,
    Three,
    Four,
    Five,
    Six,
    Seven,
    Eight,
    Nine,
    Ten,
    Jack,
    Queen,
    King,
    Ace,
}

impl Rank {
    pub const ALL: [Self; 13] = [
        Self::Two,
        Self::Three,
        Self::Four,
        Self::Five,
        Self::Six,
        Self::Seven,
        Self::Eight,
        Self::Nine,
        Self::Ten,
        Self::Jack,
        Self::Queen,
        Self::King,
        Self::Ace,
    ];

    #[must_use]
    pub const fn value(self) -> u32 {
        match self {
            Self::Two => 2,
            Self::Three => 3,
            Self::Four => 4,
            Self::Five => 5,
            Self::Six => 6,
            Self::Seven => 7,
            Self::Eight => 8,
            Self::Nine => 9,
            Self::Ten | Self::Jack | Self::Queen | Self::King => 10,
            Self::Ace => 11,
        }
    }

    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Two => "2",
            Self::Three => "3",
            Self::Four => "4",
            Self::Five => "5",
            Self::Six => "6",
            Self::Seven => "7",
            Self::Eight => "8",
            Self::Nine => "9",
            Self::Ten => "10",
            Self::Jack => "J",
            Self::Queen => "Q",
            Self::King => "K",
            Self::Ace => "A",
        }
    }

    /// Ordering value for Higher/Lower comparison. Ace is high (14).
    #[must_use]
    pub const fn order_value(self) -> u8 {
        match self {
            Self::Two => 2,
            Self::Three => 3,
            Self::Four => 4,
            Self::Five => 5,
            Self::Six => 6,
            Self::Seven => 7,
            Self::Eight => 8,
            Self::Nine => 9,
            Self::Ten => 10,
            Self::Jack => 11,
            Self::Queen => 12,
            Self::King => 13,
            Self::Ace => 14,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Card {
    pub rank: Rank,
    pub suit: Suit,
}

impl Card {
    #[must_use]
    pub const fn new(rank: Rank, suit: Suit) -> Self {
        Self { rank, suit }
    }

    #[must_use]
    pub fn display(self) -> String {
        format!("{} {}", self.rank.label(), self.suit.symbol())
    }
}

#[derive(Debug, Clone)]
pub struct Deck {
    cards: Vec<Card>,
}

impl Deck {
    #[must_use]
    pub fn new_shuffled() -> Self {
        let mut cards = Vec::with_capacity(52);
        for suit in Suit::ALL {
            for rank in Rank::ALL {
                cards.push(Card::new(rank, suit));
            }
        }
        let mut rng = rng();
        cards.shuffle(&mut rng);
        Self { cards }
    }

    pub fn draw(&mut self) -> Card {
        if self.cards.is_empty() {
            *self = Self::new_shuffled();
        }
        self.cards.pop().unwrap()
    }

    pub fn is_empty(&self) -> bool {
        self.cards.is_empty()
    }
}

#[derive(Debug, Clone, Default)]
pub struct Hand {
    pub cards: Vec<Card>,
    pub is_doubled: bool,
    pub is_stood: bool,
}

impl Hand {
    #[must_use]
    pub fn points(&self) -> u32 {
        let mut total = 0;
        let mut aces = 0;

        for card in &self.cards {
            total += card.rank.value();
            if card.rank == Rank::Ace {
                aces += 1;
            }
        }

        while total > TARGET && aces > 0 {
            total -= 10;
            aces -= 1;
        }

        total
    }

    #[must_use]
    pub fn is_bust(&self) -> bool {
        self.points() > TARGET
    }

    #[must_use]
    pub fn is_natural_blackjack(&self) -> bool {
        self.cards.len() == 2 && self.points() == TARGET
    }

    #[must_use]
    pub fn can_split(&self) -> bool {
        self.cards.len() == 2 && self.cards[0].rank == self.cards[1].rank
    }

    #[must_use]
    pub fn display(&self, hide_first_card: bool) -> String {
        if self.cards.is_empty() {
            return "No cards".to_string();
        }

        if hide_first_card {
            let visible: Vec<String> = self.cards.iter().skip(1).map(|c| c.display()).collect();
            format!("Hidden, {}", visible.join(", "))
        } else {
            self.cards
                .iter()
                .map(|c| c.display())
                .collect::<Vec<_>>()
                .join(", ")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hand_calculation_with_aces() {
        let mut hand = Hand::default();
        hand.cards.push(Card::new(Rank::Ace, Suit::Spades));
        hand.cards.push(Card::new(Rank::Nine, Suit::Hearts));
        assert_eq!(hand.points(), 20);

        // Add another card, Ace should downgrade to 1
        hand.cards.push(Card::new(Rank::Five, Suit::Clubs));
        assert_eq!(hand.points(), 15);
    }

    #[test]
    fn test_natural_blackjack() {
        let mut hand = Hand::default();
        hand.cards.push(Card::new(Rank::Ace, Suit::Spades));
        hand.cards.push(Card::new(Rank::King, Suit::Hearts));
        assert!(hand.is_natural_blackjack());
    }
}