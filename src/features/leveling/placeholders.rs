use crate::core::config::guild_ctx::GuildCtx;
use crate::shared::placeholders::{DiscordCtx, PlaceholderResolver, ResolverChain, render};
use serenity::all::User;

/// Custom resolver for leveling-specific keys like `{level}` or `{level.old}`
pub struct LevelingResolver {
    pub current_level: i32,
    pub previous_level: i32,
}

impl PlaceholderResolver for LevelingResolver {
    fn resolve(&self, key: &str) -> Option<String> {
        match key {
            "level" | "level.new" | "level.current" => Some(self.current_level.to_string()),
            "level.old" | "level.previous" => Some(self.previous_level.to_string()),
            _ => None,
        }
    }
}

pub fn replace_level_notify_placeholder(
    text: &str,
    gctx: &GuildCtx,
    user: &User,
    current_level: i32,
    previous_level: i32,
) -> String {
    let discord_ctx = DiscordCtx {
        gctx: Some(gctx),
        user: Some(user),
        ..Default::default()
    };

    let leveling_resolver = LevelingResolver {
        current_level,
        previous_level,
    };

    let chain = ResolverChain(vec![&leveling_resolver, &discord_ctx]);

    render(text, &chain)
}