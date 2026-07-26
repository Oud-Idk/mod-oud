use serenity::all::{GuildChannel, Message, PartialMember, User};
use crate::core::config::guild_ctx::GuildCtx;
use crate::shared::placeholders::{render, DiscordCtx, PlaceholderResolver, ResolverChain};

pub struct PartialMemberCtx<'a> {
    pub member: Option<&'a PartialMember>,
    pub user: Option<&'a User>,
}

impl PlaceholderResolver for PartialMemberCtx<'_> {
    fn resolve(&self, key: &str) -> Option<String> {
        // Resolve Member / User keys
        if ["user", "member", "player", "host"].iter().any(|prefix| key.starts_with(prefix)) {
            // First try resolving from user
            if let Some(user) = self.user {
                let val = match key {
                    "user" | "user.mention" | "member" | "member.mention" | "player" | "host" => {
                        Some(format!("<@{}>", user.id))
                    }
                    "user.name" | "member.username" | "host.name" => Some(user.name.clone()),
                    "user.id" | "member.id" | "host.id" => Some(user.id.to_string()),
                    "user.avatar_url" | "member.avatar_url" | "member.profile_picture" => Some(user.face()),
                    "user.bot" | "member.bot" => Some(user.bot.to_string()),
                    _ => None,
                };
                if val.is_some() {
                    return val;
                }
            }

            if let Some(member) = self.member {
                return match key {
                    "member.nickname" | "member.nick" | "user.nickname" => member.nick.clone(),
                    _ => None,
                };
            }
        }

        None
    }
}

pub fn replace_general_placeholders(text: &str, msg: &Message, gctx: &GuildCtx, channel: Option<&GuildChannel>) -> String {
    let discord_ctx = DiscordCtx {
        gctx: Some(&gctx),
        user: Some(&msg.author),
        channel,
        message: Some(msg),
        ..Default::default()
    };

    let partial_member_ctx = PartialMemberCtx {
        member: msg.member.as_deref(),
        user: Some(&msg.author),
    };

    let chain = ResolverChain(vec![&discord_ctx, &partial_member_ctx]);

    render(text, &chain)
}