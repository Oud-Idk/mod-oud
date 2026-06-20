use crate::core::config::GuildCtx;
use crate::types::config::starboard::Starboard;
use duration_str::HumanFormat;
use rand::RngExt;
use regex::{Captures, Regex};
use std::sync::OnceLock;
use std::time::Duration;

pub fn replace_welcome_goodbye_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    channel: &serenity::all::GuildChannel,
    plan_name: Option<&str>,
    achievement: Option<&str>,
) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"\{(?P<key>[^}]+)}").unwrap());

    re.replace_all(text, |caps: &Captures| {
        match &caps["key"] {
            "server" | "server.name" => gctx.name.clone(),
            "server.id" => gctx.id.clone(),
            "server.icon_url" => gctx.icon_url.clone(),
            "server.icon" => gctx.icon_hash.clone(),
            "server.owner" => format!("<@{}>", gctx.owner_id),
            "server.owner_id" => gctx.owner_id.clone(),
            "server.member_count" => gctx.member_count.clone(),
            "server.verification_level" => gctx.verification_level.clone(),
            "server.joined_at" => gctx.joined_at.clone(),

            "user" | "user.mention" | "member" | "member.mention" | "player" => {
                format!("<@{}>", member.user.id)
            }
            "user.name" | "member.username" => member.user.name.clone(),
            "user.id" | "member.id" => member.user.id.to_string(),
            "user.avatar" | "member.avatar" => {
                member.user.avatar.map(|h| h.to_string()).unwrap_or_default()
            }
            "user.avatar_url" | "member.avatar_url" | "member.profile_picture" => {
                member.user.face()
            }
            "user.bot" | "member.bot" => member.user.bot.to_string(),
            "member.count" => gctx.member_count.clone(),

            "channel" | "channel.mention" => format!("<#{}>", channel.id),
            "channel.name" => channel.name.clone(),
            "channel.id" => channel.id.to_string(),
            "channel.type" => u8::from(channel.kind).to_string(),

            "random" => rand::rng().random_range(0..=10).to_string(),
            key if key.starts_with("random:") => {
                let mut parts = key.splitn(3, ':').skip(1);
                let min: i64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
                let max: i64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(10);

                let (lower, upper) = if min <= max { (min, max) } else { (max, min) };
                rand::rng().random_range(lower..=upper).to_string()
            }

            // ── Custom Context (Plans / Achievements) ─────────────────────────
            "plan.name" => plan_name.unwrap_or_default().to_string(),
            "achievement" => achievement.unwrap_or_default().to_string(),

            // ── Unknown: echo back verbatim ──────────────────────────────────
            _ => caps[0].to_string(),
        }
    })
        .into_owned()
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
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"\{(?P<key>[^}]+)}").unwrap());

    re.replace_all(text, |caps: &Captures| {
        match &caps["key"] {
            // ── Server ──────────────────────────────────────────────────────────
            "server.name" => gctx.name.clone(),
            "server.id" => gctx.id.clone(),
            "server.icon_url" => gctx.icon_url.clone(),
            "server.member_count" => gctx.member_count.clone(),

            // ── Message ─────────────────────────────────────────────────────────
            "message.text" => message.content.clone(),
            "message.timestamp" => {
                // Formats the timestamp (e.g., "January 01, 1970, at 00:00")
                message.timestamp.format("%B %d, %Y at %R").to_string()
            }
            "message.stars_count" => star_count.to_string(),
            "message.link" => message.link(),

            // ── Starboard ───────────────────────────────────────────────────────
            "starboard.emojis" => starboard.emojis.as_ref()
                .map(|emojis| emojis.join(", "))
                .unwrap_or_default(),
            "starboard.first_emoji" => starboard.emojis.as_ref()
                .and_then(|v| v.first().cloned())
                .unwrap_or_default(),

            // ── Member ──────────────────────────────────────────────────────────
            "member.mention" => format!("<@{}>", member.user.id),
            "member.username" => member.user.name.clone(),
            "member.id" => member.user.id.to_string(),
            "member.avatar_url" => member.user.face(),

            // ── Channel ─────────────────────────────────────────────────────────
            "channel.mention" => format!("<#{}>", source_channel.id),
            "channel.name" => channel.name.clone(),
            "channel.id" => channel.id.to_string(),

            // ── Unknown: echo back verbatim ──────────────────────────────────
            _ => caps[0].to_string(),
        }
    })
        .into_owned()
}

fn resolve_common_placeholder(
    key: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
) -> Option<String> {
    match key {
        "server.name" => Some(gctx.name.clone()),
        "server.id" => Some(gctx.id.clone()),
        "server.icon_url" => Some(gctx.icon_url.clone()),
        "member.username" => Some(member.user.name.clone()),
        "member.id" => Some(member.user.id.to_string()),
        "member.avatar_url" => Some(member.user.face()),
        _ => None,
    }
}

// Resolves placeholders related to the moderator performing the action
fn resolve_moderator_placeholder(
    key: &str,
    moderator: &serenity::all::User,
) -> Option<String> {
    match key {
        "moderator.username" => Some(moderator.name.clone()),
        "moderator.id" => Some(moderator.id.to_string()),
        _ => None,
    }
}

// Internal helper to get or initialize the regex pattern
fn get_placeholder_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\{(?P<key>[^}]+)}").unwrap())
}

pub fn replace_reason_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    reason: &str,
    moderator: &serenity::all::User,
) -> String {
    let re = get_placeholder_regex();

    re.replace_all(text, |caps: &Captures| {
        let key = &caps["key"];

        if let Some(val) = resolve_common_placeholder(key, gctx, member) {
            return val;
        }
        if let Some(val) = resolve_moderator_placeholder(key, moderator) {
            return val;
        }

        match key {
            "reason" => reason.to_string(),
            _ => caps[0].to_string(),
        }
    })
        .into_owned()
}

pub fn replace_ban_placeholders(
    text: &str,
    gctx: &GuildCtx, // Adjust to your actual GuildCtx struct
    member: &serenity::all::Member,
    reason: &str,
    moderator: &serenity::all::User,
) -> String {
    // Standardize the replacement values
    let re = get_placeholder_regex();

    re.replace_all(text, |caps: &Captures| {
        let key = &caps["key"];

        if let Some(val) = resolve_common_placeholder(key, gctx, member) {
            return val;
        }
        if let Some(val) = resolve_moderator_placeholder(key, moderator) {
            return val;
        }

        match key {
            "reason" => reason.to_string(),
            "appeal_link" => "to be implemented".to_string(),
            _ => caps[0].to_string(),
        }
    })
        .into_owned()
}

pub fn replace_kick_placeholder(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    reason: &str,
    moderator: &serenity::all::User,
    invite_url: Option<&str>,
) -> String {
    let re = get_placeholder_regex();

    re.replace_all(text, |caps: &Captures| {
        let key = &caps["key"];

        if let Some(val) = resolve_common_placeholder(key, gctx, member) {
            return val;
        }
        if let Some(val) = resolve_moderator_placeholder(key, moderator) {
            return val;
        }

        match key {
            "reason" => reason.to_string(),
            "invite.url" => invite_url.unwrap_or("<there was no invite URL. Please ask the server owner for one.>").to_string(),
            _ => caps[0].to_string(),
        }
    })
        .into_owned()
}

pub fn replace_mute_placeholder(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    reason: &str,
    moderator: &serenity::all::User,
    dur: &Duration,
) -> String {
    let re = get_placeholder_regex();

    re.replace_all(text, |caps: &Captures| {
        let key = &caps["key"];

        if let Some(val) = resolve_common_placeholder(key, gctx, member) {
            return val;
        }
        if let Some(val) = resolve_moderator_placeholder(key, moderator) {
            return val;
        }

        match key {
            "reason" => reason.to_string(),
            "duration" => dur.human_format(),
            _ => caps[0].to_string(),
        }
    })
        .into_owned()
}

pub fn replace_basic_placeholder(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    moderator: &serenity::all::User,
) -> String {
    let re = get_placeholder_regex();

    re.replace_all(text, |caps: &Captures| {
        let key = &caps["key"];

        if let Some(val) = resolve_common_placeholder(key, gctx, member) {
            return val;
        }
        if let Some(val) = resolve_moderator_placeholder(key, moderator) {
            return val;
        }

        return caps[0].to_string();
    })
        .into_owned()
}

pub fn replace_level_notify_placeholder(
    text: &str,
    gctx: &GuildCtx,
    user: &serenity::all::User,
    current_level: i32,
    previous_level: i32,
) -> String {
    let re = get_placeholder_regex();

    re.replace_all(text, |caps: &Captures| {
        let key = &caps["key"];

        match key {
            "server.name" => gctx.name.clone(),
            "server.id" => gctx.id.clone(),
            "server.icon_url" => gctx.icon_url.clone(),
            "member.username" => user.name.clone(),
            "member.id" => user.id.to_string(),
            "member.avatar_url" => user.face(),
            "member.mention" => format!("<@{}>", user.id.get()),
            "level.current" => current_level.to_string(),
            "level.previous" => previous_level.to_string(),
            _ => caps[0].to_string(),
        }
    }).into_owned()
}

pub fn replace_ticket_panel_placeholders(
    text: &str,
    gctx: &GuildCtx,
    role_id: Option<serenity::all::RoleId>,
    role_name: Option<&str>,
) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"\{(?P<key>[^}]+)}").unwrap());

    re.replace_all(text, |caps: &regex::Captures| {
        match &caps["key"] {
            // ── Server ──────────────────────────────────────────────────────────
            "server.name" => gctx.name.clone(),
            "server.id" => gctx.id.clone(),
            "server.icon_url" => gctx.icon_url.clone(),
            "server.member_count" => gctx.member_count.clone(),

            // ── Role ────────────────────────────────────────────────────────────
            "role.mention" => role_id
                .map(|id| format!("<@&{}>", id))
                .unwrap_or_default(),
            "role.name" => role_name
                .map(|name| name.to_string())
                .unwrap_or_default(),
            "role.id" => role_id
                .map(|id| id.to_string())
                .unwrap_or_default(),

            // ── Unknown: echo back verbatim ──────────────────────────────────
            _ => caps[0].to_string(),
        }
    })
        .into_owned()
}

pub fn replace_ticket_welcome_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: Option<&serenity::all::Member>,
    role_id: Option<&serenity::all::RoleId>,
    role_name: Option<&str>,
    channel: Option<&serenity::all::GuildChannel>,
) -> String {
    let re = get_placeholder_regex();

    re.replace_all(text, |caps: &Captures| {
        match &caps["key"] {
            "server.name" => gctx.name.clone(),
            "server.id" => gctx.id.clone(),
            "server.icon_url" => gctx.icon_url.clone(),

            "member.mention" => member
                .map(|m| format!("<@{}>", m.user.id))
                .unwrap_or_default(),
            "member.username" => member
                .map(|m| m.user.name.clone())
                .unwrap_or_default(),
            "member.id" => member
                .map(|m| m.user.id.to_string())
                .unwrap_or_default(),
            "member.avatar_url" => member
                .map(|m| m.user.face())
                .unwrap_or_default(),

            "role.mention" => role_id
                .map(|id| format!("<@&{}>", id))
                .unwrap_or_default(),
            "role.name" => role_name
                .map(|name| name.to_string())
                .unwrap_or_default(),
            "role.id" => role_id
                .map(|id| id.to_string())
                .unwrap_or_default(),

            "channel.mention" => channel
                .map(|c| format!("<#{}>", c.id))
                .unwrap_or_default(),
            "channel.name" => channel
                .map(|c| c.name.clone())
                .unwrap_or_default(),
            "channel.id" => channel
                .map(|c| c.id.to_string())
                .unwrap_or_default(),

            _ => caps[0].to_string(),
        }
    })
        .into_owned()
}