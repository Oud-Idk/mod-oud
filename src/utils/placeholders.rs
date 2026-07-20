use crate::core::config::GuildCtx;
use crate::types::config::starboard::Starboard;
use duration_str::HumanFormat;
use rand::RngExt;
use regex::{Captures, Regex};
use std::sync::OnceLock;
use std::time::Duration;

#[derive(Default)]
pub struct ReplacementCtx<'a> {
    pub gctx: Option<&'a GuildCtx>,
    pub member: Option<&'a serenity::all::Member>,
    pub user: Option<&'a serenity::all::User>,
    pub channel: Option<&'a serenity::all::GuildChannel>,
    pub source_channel: Option<&'a serenity::all::GuildChannel>,
    pub message: Option<&'a serenity::all::Message>,
    pub starboard: Option<&'a Starboard>,
    pub star_count: Option<u64>,
    pub reason: Option<&'a str>,
    pub moderator: Option<&'a serenity::all::User>,
    pub plan_name: Option<&'a str>,
    pub achievement: Option<&'a str>,
    pub appeal_link: Option<&'a str>,
    pub invite_url: Option<&'a str>,
    pub duration: Option<Duration>,
    pub current_level: Option<i32>,
    pub previous_level: Option<i32>,
    pub role_id: Option<serenity::all::RoleId>,
    pub role_name: Option<&'a str>,
}

impl<'a> ReplacementCtx<'a> {
    fn user(&self) -> Option<&serenity::all::User> {
        self.user.or_else(|| self.member.map(|m| &m.user))
    }
}

pub fn get_placeholder_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\{(?P<key>[^}]+)}").unwrap())
}

fn replace_all(text: &str, ctx: &ReplacementCtx) -> String {
    let re = get_placeholder_regex();

    re.replace_all(text, |caps: &Captures| {
        let key = &caps["key"];
        resolve_placeholder(key, ctx).unwrap_or_else(|| caps[0].to_string())
    })
        .into_owned()
}

fn resolve_placeholder(key: &str, ctx: &ReplacementCtx) -> Option<String> {
    // Guild / Server-related
    if key.starts_with("server") || key == "member.count" {
        let gctx = ctx.gctx?;
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
        let user = ctx.user()?;
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
        let channel = ctx.channel.or(ctx.source_channel)?;
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
        let msg = ctx.message?;
        return Some(match key {
            "message.text" => msg.content.clone(),
            "message.timestamp" => msg.timestamp.format("%B %d, %Y at %R").to_string(),
            "message.stars_count" => ctx.star_count.unwrap_or_default().to_string(),
            "message.link" => msg.link(),
            _ => return None,
        });
    }

    // Moderator
    if key.starts_with("moderator") {
        let mod_user = ctx.moderator?;
        return Some(match key {
            "moderator.username" => mod_user.name.clone(),
            "moderator.id" => mod_user.id.to_string(),
            _ => return None,
        });
    }

    // Starboard
    if key.starts_with("starboard") {
        let sb = ctx.starboard?;
        return Some(match key {
            "starboard.emojis" => sb.emojis.as_ref().map(|e| e.join(", ")).unwrap_or_default(),
            "starboard.first_emoji" => sb.emojis.as_ref().and_then(|v| v.first().cloned()).unwrap_or_default(),
            _ => return None,
        });
    }

    // Roles
    if key.starts_with("role") {
        return Some(match key {
            "role.mention" => ctx.role_id.map(|id| format!("<@&{}>", id)).unwrap_or_default(),
            "role.name" => ctx.role_name.unwrap_or_default().to_string(),
            "role.id" => ctx.role_id.map(|id| id.to_string()).unwrap_or_default(),
            _ => return None,
        });
    }

    // Levels
    if key.starts_with("level") {
        return Some(match key {
            "level.current" => ctx.current_level.unwrap_or_default().to_string(),
            "level.previous" => ctx.previous_level.unwrap_or_default().to_string(),
            _ => return None,
        });
    }

    // Random Number Generator
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

    // Direct Keys
    match key {
        "plan.name" => Some(ctx.plan_name.unwrap_or_default().to_string()),
        "achievement" => Some(ctx.achievement.unwrap_or_default().to_string()),
        "reason" => Some(ctx.reason.unwrap_or_default().to_string()),
        "appeal_link" => Some(ctx.appeal_link.unwrap_or("to be implemented").to_string()),
        "invite.url" => Some(ctx.invite_url.unwrap_or("<there was no invite URL. Please ask the server owner for one.>").to_string()),
        "duration" => Some(ctx.duration.map(|d| d.human_format()).unwrap_or_default()),
        _ => None,
    }
}

pub fn replace_welcome_goodbye_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    channel: &serenity::all::GuildChannel,
    plan_name: Option<&str>,
    achievement: Option<&str>,
) -> String {
    replace_all(text, &ReplacementCtx {
        gctx: Some(gctx),
        member: Some(member),
        channel: Some(channel),
        plan_name,
        achievement,
        ..Default::default()
    })
}

pub fn replace_starboard_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    channel: &serenity::all::GuildChannel,
    source_channel: &serenity::all::GuildChannel,
    message: &serenity::all::Message,
    starboard: &Starboard,
    star_count: &u64,
) -> String {
    replace_all(text, &ReplacementCtx {
        gctx: Some(gctx),
        member: Some(member),
        channel: Some(channel),
        source_channel: Some(source_channel),
        message: Some(message),
        starboard: Some(starboard),
        star_count: Some(*star_count),
        ..Default::default()
    })
}

pub fn replace_reason_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    reason: &str,
    moderator: &serenity::all::User,
) -> String {
    replace_all(text, &ReplacementCtx {
        gctx: Some(gctx),
        member: Some(member),
        reason: Some(reason),
        moderator: Some(moderator),
        ..Default::default()
    })
}

pub fn replace_ban_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    reason: &str,
    moderator: &serenity::all::User,
) -> String {
    replace_all(text, &ReplacementCtx {
        gctx: Some(gctx),
        member: Some(member),
        reason: Some(reason),
        moderator: Some(moderator),
        ..Default::default()
    })
}

pub fn replace_kick_placeholder(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    reason: &str,
    moderator: &serenity::all::User,
    invite_url: Option<&str>,
) -> String {
    replace_all(text, &ReplacementCtx {
        gctx: Some(gctx),
        member: Some(member),
        reason: Some(reason),
        moderator: Some(moderator),
        invite_url,
        ..Default::default()
    })
}

pub fn replace_mute_placeholder(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    reason: &str,
    moderator: &serenity::all::User,
    dur: &Duration,
) -> String {
    replace_all(text, &ReplacementCtx {
        gctx: Some(gctx),
        member: Some(member),
        reason: Some(reason),
        moderator: Some(moderator),
        duration: Some(*dur),
        ..Default::default()
    })
}

pub fn replace_basic_placeholder(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    moderator: &serenity::all::User,
) -> String {
    replace_all(text, &ReplacementCtx {
        gctx: Some(gctx),
        member: Some(member),
        moderator: Some(moderator),
        ..Default::default()
    })
}

pub fn replace_level_notify_placeholder(
    text: &str,
    gctx: &GuildCtx,
    user: &serenity::all::User,
    current_level: i32,
    previous_level: i32,
) -> String {
    replace_all(text, &ReplacementCtx {
        gctx: Some(gctx),
        user: Some(user),
        current_level: Some(current_level),
        previous_level: Some(previous_level),
        ..Default::default()
    })
}

pub fn replace_ticket_panel_placeholders(
    text: &str,
    gctx: &GuildCtx,
    role_id: Option<serenity::all::RoleId>,
    role_name: Option<&str>,
) -> String {
    replace_all(text, &ReplacementCtx {
        gctx: Some(gctx),
        role_id,
        role_name,
        ..Default::default()
    })
}

pub fn replace_ticket_welcome_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: Option<&serenity::all::Member>,
    role_id: Option<&serenity::all::RoleId>,
    role_name: Option<&str>,
    channel: Option<&serenity::all::GuildChannel>,
) -> String {
    replace_all(text, &ReplacementCtx {
        gctx: Some(gctx),
        member,
        role_id: role_id.cloned(),
        role_name,
        channel,
        ..Default::default()
    })
}