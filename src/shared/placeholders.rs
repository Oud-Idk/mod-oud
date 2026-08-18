use crate::core::config::guild_ctx::GuildCtx;
use rand::RngExt;
use regex::{Captures, Regex};
use serenity::all::{GuildChannel, Member, Message, User};
use std::sync::OnceLock;

/// Resolves a placeholder key (e.g. `server.name`) into its rendered value.
pub trait PlaceholderResolver: Send + Sync {
    /// Returns the replacement string for `key`, or `None` if unknown.
    fn resolve(&self, key: &str) -> Option<String>;
}

/// Chains multiple resolvers, returning the first non-`None` match.
pub struct ResolverChain<'a>(pub Vec<&'a (dyn PlaceholderResolver + Send + Sync)>);

impl PlaceholderResolver for ResolverChain<'_> {
    fn resolve(&self, key: &str) -> Option<String> {
        self.0.iter().find_map(|r| r.resolve(key))
    }
}

/// Replaces every `{key}` placeholder in `text` using `resolver`. Unknown
/// placeholders are left untouched.
pub fn render(text: &str, resolver: &dyn PlaceholderResolver) -> String {
    let re = get_placeholder_regex();
    re.replace_all(text, |caps: &Captures| {
        resolver
            .resolve(&caps["key"])
            .unwrap_or_else(|| caps[0].to_string())
    })
    .into_owned()
}

/// Optional Discord context used to resolve user/member, channel, and message
/// placeholders.
#[derive(Default)]
pub struct DiscordCtx<'a> {
    /// Guild context for server-related placeholders.
    pub gctx: Option<&'a GuildCtx>,
    /// Member whose user placeholders resolve to.
    pub member: Option<&'a Member>,
    /// User for user-related placeholders.
    pub user: Option<&'a User>,
    /// Channel for channel-related placeholders.
    pub channel: Option<&'a GuildChannel>,
    /// Original channel the message was sent in.
    pub source_channel: Option<&'a GuildChannel>,
    /// Message for message-related placeholders.
    pub message: Option<&'a Message>,
}

impl DiscordCtx<'_> {
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
                "server.icon_url" => gctx.icon_url.clone().unwrap_or_default(),
                "server.icon" => gctx.icon_hash.clone().unwrap_or_default(),
                "server.owner" => format!("<@{}>", gctx.owner_id),
                "server.owner_id" => gctx.owner_id.clone(),
                "server.member_count" | "member.count" => gctx.member_count.to_string(),
                "server.verification_level" => u8::from(gctx.verification_level).to_string(),
                "server.joined_at" => gctx.joined_at.clone().unwrap_or_default(),
                _ => return None,
            });
        }

        // Member / User-related (resolves user or member)
        if ["user", "member", "player", "host"]
            .iter()
            .any(|prefix| key.starts_with(prefix))
        {
            let user = self.user()?;
            return Some(match key {
                "user" | "user.mention" | "member" | "member.mention" | "player" | "host"
                | "host.mention" => format!("<@{}>", user.id),
                "user.name" | "member.username" | "host.name" | "host.username" => {
                    user.name.clone()
                }
                "user.id" | "member.id" | "host.id" => user.id.to_string(),
                "user.avatar" | "member.avatar" | "host.avatar" => {
                    user.avatar.map(|h| h.to_string()).unwrap_or_default()
                }
                "user.avatar_url"
                | "member.avatar_url"
                | "member.profile_picture"
                | "host.avatar_url"
                | "host.profile_picture" => user.face(),
                "user.bot" | "member.bot" | "host.bot" => user.bot.to_string(),
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

/// Returns the shared regex used to match `{key}` placeholders.
pub fn get_placeholder_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\{(?P<key>[^}]+)}").unwrap())
}
