use crate::core::config::GuildCtx;
use rand::RngExt;
use regex::{Captures, Regex};
use serenity::all::{GuildChannel, Member, Message, User};
use std::sync::OnceLock;

// shared/placeholders.rs
pub trait PlaceholderResolver {
    fn resolve(&self, key: &str) -> Option<String>;
}

pub struct ResolverChain<'a>(pub Vec<&'a dyn PlaceholderResolver>);

impl PlaceholderResolver for ResolverChain<'_> {
    fn resolve(&self, key: &str) -> Option<String> {
        self.0.iter().find_map(|r| r.resolve(key))
    }
}

pub fn render(text: &str, resolver: &dyn PlaceholderResolver) -> String {
    let re = get_placeholder_regex();
    re.replace_all(text, |caps: &Captures| {
        resolver.resolve(&caps["key"]).unwrap_or_else(|| caps[0].to_string())
    }).into_owned()
}

#[derive(Default)]
pub struct DiscordCtx<'a> {
    pub gctx: Option<&'a GuildCtx>,
    pub member: Option<&'a Member>,
    pub user: Option<&'a User>,
    pub channel: Option<&'a GuildChannel>,
    pub source_channel: Option<&'a GuildChannel>,
    pub message: Option<&'a Message>,
}

impl<'a> DiscordCtx<'a> {
    fn user(&self) -> Option<&User> {
        self.user.or_else(|| self.member.map(|m| &m.user))
    }
}

impl PlaceholderResolver for DiscordCtx<'_> {
    fn resolve(&self, key: &str) -> Option<String> {
        // Guild / Server-related
        if key.starts_with("server") || key == "member.count" {
            let gctx = self.gctx?;
            return Some(match key {
                "server" | "server.name" => gctx.name.clone(),
                "server.id" => gctx.id.clone(),
                "server.icon_url" => gctx.icon_url.clone(),
                "server.icon" => gctx.icon_hash.clone(),
                "server.owner" => format!("<@{}>", gctx.owner_id),
                "server.owner_id" => gctx.owner_id.clone(),
                "server.member_count" | "member.count" => gctx.member_count.clone(),
                "server.verification_level" => gctx.verification_level.clone(),
                "server.joined_at" => gctx.joined_at.clone(),
                _ => return None,
            });
        }

        // Member / User-related (resolves user or member)
        if ["user", "member", "player"].iter().any(|prefix| key.starts_with(prefix)) {
            let user = self.user()?;
            return Some(match key {
                "user" | "user.mention" | "member" | "member.mention" | "player" => format!("<@{}>", user.id),
                "user.name" | "member.username" => user.name.clone(),
                "user.id" | "member.id" => user.id.to_string(),
                "user.avatar" | "member.avatar" => user.avatar.map(|h| h.to_string()).unwrap_or_default(),
                "user.avatar_url" | "member.avatar_url" | "member.profile_picture" => user.face(),
                "user.bot" | "member.bot" => user.bot.to_string(),
                _ => return None,
            });
        }

        // Channels
        if key.starts_with("channel") {
            let channel = self.channel.or(self.source_channel)?;
            return Some(match key {
                "channel" | "channel.mention" => format!("<#{}>", channel.id),
                "channel.name" => channel.name.clone(),
                "channel.id" => channel.id.to_string(),
                "channel.type" => u8::from(channel.kind).to_string(),
                _ => return None,
            });
        }

        // Message
        if key.starts_with("message") {
            let msg = self.message?;
            return Some(match key {
                "message.text" => msg.content.clone(),
                "message.timestamp" => msg.timestamp.format("%B %d, %Y at %R").to_string(),
                "message.link" => msg.link(),
                _ => return None,
            });
        }

        // Random Number Generator — pure utility, no domain knowledge
        if key == "random" {
            return Some(rand::rng().random_range(0..=10).to_string());
        }
        if key.starts_with("random:") {
            let mut parts = key.splitn(3, ':').skip(1);
            let min: i64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
            let max: i64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(10);
            let (lower, upper) = if min <= max { (min, max) } else { (max, min) };
            return Some(rand::rng().random_range(lower..=upper).to_string());
        }

        None
    }
}


pub fn get_placeholder_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\{(?P<key>[^}]+)}").unwrap())
}