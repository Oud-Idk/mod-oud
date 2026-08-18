use crate::core::config::guild_ctx::GuildCtx;
use crate::shared::placeholders::{DiscordCtx, PlaceholderResolver, ResolverChain, render};
use serenity::all::User;

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

pub fn replace_giveaway_placeholders(
    text: &str,
    prize: &str,
    winner_count: i32,
    host_user: &User,
    gctx: &GuildCtx,
    end_time_str: &str,
) -> String {
    let giveaway_ctx = GiveawayCtx {
        prize,
        winner_count,
        end_time_str,
    };

    let discord_ctx = DiscordCtx {
        gctx: Some(gctx),
        user: Some(host_user),
        ..Default::default()
    };

    let resolver = ResolverChain(vec![&giveaway_ctx, &discord_ctx]);
    render(text, &resolver)
}
