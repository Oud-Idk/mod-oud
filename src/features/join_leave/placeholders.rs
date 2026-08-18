use crate::core::config::guild_ctx::GuildCtx;
use crate::shared::placeholders::{DiscordCtx, PlaceholderResolver, ResolverChain, render};
use serenity::all::{GuildChannel, Member};

/// Custom resolver for join/leave specific keys like `{plan.name}` or `{warning}`
pub struct JoinLeaveResolver<'a> {
    pub plan_name: Option<&'a str>,
    pub achievement: Option<&'a str>,
}

impl PlaceholderResolver for JoinLeaveResolver<'_> {
    fn resolve(&self, key: &str) -> Option<String> {
        match key {
            "plan" | "plan.name" => self.plan_name.map(std::string::ToString::to_string),
            "achievement" | "warning" | "alt_warning" => {
                self.achievement.map(std::string::ToString::to_string)
            }
            _ => None,
        }
    }
}

pub fn replace_welcome_goodbye_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: &Member,
    channel: &GuildChannel,
    plan_name: Option<&str>,
    achievement: Option<&str>,
) -> String {
    let discord_ctx = DiscordCtx {
        gctx: Some(gctx),
        member: Some(member),
        channel: Some(channel),
        ..Default::default()
    };

    let join_leave_resolver = JoinLeaveResolver {
        plan_name,
        achievement,
    };

    let chain = ResolverChain(vec![&join_leave_resolver, &discord_ctx]);

    render(text, &chain)
}
