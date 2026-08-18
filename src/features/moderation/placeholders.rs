use crate::core::config::guild_ctx::GuildCtx;
use crate::shared::placeholders::{DiscordCtx, PlaceholderResolver, ResolverChain, render};
use duration_str::HumanFormat;
use serenity::all::{Member, User};
use std::time::Duration;

#[derive(Default)]
pub struct ModerationCtx<'a> {
    pub reason: Option<&'a str>,
    pub moderator: Option<&'a User>,
    pub invite_url: Option<&'a str>,
    pub duration: Option<Duration>,
}

impl PlaceholderResolver for ModerationCtx<'_> {
    fn resolve(&self, key: &str) -> Option<String> {
        if key.starts_with("moderator") {
            let mod_user = self.moderator?;
            return Some(match key {
                "moderator.username" => mod_user.name.clone(),
                "moderator.id" => mod_user.id.to_string(),
                _ => return None,
            });
        }
        match key {
            "reason" => Some(self.reason.unwrap_or_default().to_string()),
            "invite.url" => Some(
                self.invite_url
                    .unwrap_or("<there was no invite URL. Please ask the server owner for one.>")
                    .to_string(),
            ),
            "duration" => Some(self.duration.map(|d| d.human_format()).unwrap_or_default()),
            _ => None,
        }
    }
}

pub fn replace_kick_placeholder(
    text: &str,
    gctx: &GuildCtx,
    member: &Member,
    reason: &str,
    moderator: &User,
    invite_url: Option<&str>,
) -> String {
    let discord = DiscordCtx {
        gctx: Some(gctx),
        member: Some(member),
        ..Default::default()
    };
    let modctx = ModerationCtx {
        reason: Some(reason),
        moderator: Some(moderator),
        invite_url,
        duration: None,
    };
    render(text, &ResolverChain(vec![&discord, &modctx]))
}

/// Renders moderation-related placeholders in a reason string.
#[must_use]
pub fn replace_reason_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: &Member,
    reason: &str,
    moderator: &User,
) -> String {
    let discord = DiscordCtx {
        gctx: Some(gctx),
        member: Some(member),
        ..Default::default()
    };
    let modctx = ModerationCtx {
        reason: Some(reason),
        moderator: Some(moderator),
        ..Default::default()
    };
    render(text, &ResolverChain(vec![&discord, &modctx]))
}

pub fn replace_ban_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: &Member,
    reason: &str,
    moderator: &User,
) -> String {
    let discord = DiscordCtx {
        gctx: Some(gctx),
        member: Some(member),
        ..Default::default()
    };
    let modctx = ModerationCtx {
        reason: Some(reason),
        moderator: Some(moderator),
        ..Default::default()
    };
    render(text, &ResolverChain(vec![&discord, &modctx]))
}

pub fn replace_mute_placeholder(
    text: &str,
    gctx: &GuildCtx,
    member: &Member,
    reason: &str,
    moderator: &User,
    dur: &Duration,
) -> String {
    let discord = DiscordCtx {
        gctx: Some(gctx),
        member: Some(member),
        ..Default::default()
    };
    let modctx = ModerationCtx {
        reason: Some(reason),
        moderator: Some(moderator),
        duration: Some(*dur),
        ..Default::default()
    };
    render(text, &ResolverChain(vec![&discord, &modctx]))
}

/// Renders moderation placeholders without a specific reason.
#[must_use]
pub fn replace_basic_placeholder(
    text: &str,
    gctx: &GuildCtx,
    member: &Member,
    moderator: &User,
) -> String {
    let discord = DiscordCtx {
        gctx: Some(gctx),
        member: Some(member),
        ..Default::default()
    };
    let modctx = ModerationCtx {
        moderator: Some(moderator),
        ..Default::default()
    };
    render(text, &ResolverChain(vec![&discord, &modctx]))
}

/// Renders moderation placeholders for a system-issued ban (no member context).
#[must_use]
pub fn replace_system_ban_placeholders(
    text: &str,
    gctx: &GuildCtx,
    user: &User,
    duration: Option<Duration>,
) -> String {
    let discord = DiscordCtx {
        gctx: Some(gctx),
        user: Some(user),
        ..Default::default()
    };
    let modctx = ModerationCtx {
        duration,
        ..Default::default()
    };
    render(text, &ResolverChain(vec![&discord, &modctx]))
}
