use crate::shared::placeholders::{DiscordCtx, PlaceholderResolver};

pub struct GiveawayCtx<'a> {
    pub prize: &'a str,
    pub winner_count: i32,
    pub end_time_str: &'a str,
}

impl PlaceholderResolver for GiveawayCtx<'_> {
    fn resolve(&self, key: &str) -> Option<String> {
        match key {
            "prize" | "giveaway.prize" => Some(self.prize.to_string()),
            "winners" | "giveaway.winners" => Some(self.winner_count.to_string()),
            "end_time" | "giveaway.end_time" => Some(self.end_time_str.to_string()),
            _ => None,
        }
    }
}

