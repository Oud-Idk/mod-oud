use crate::types::config::config::GuildSettings;
use crate::types::config::starboard::Starboard;
use duration_str::HumanFormat;
use poise::serenity_prelude as serenity;
use rand::RngExt;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use regex::{Captures, Regex};
use std::sync::OnceLock;
use std::time::Duration;

pub struct GuildCtx {
    pub(crate) name: String,
    id: String,
    pub(crate) icon_url: String,
    icon_hash: String,
    owner_id: String,
    member_count: String,
    verification_level: String,
    joined_at: String,
}

pub async fn get_guild_ctx(
    guild_id: serenity::GuildId,
    cache_http: impl serenity::CacheHttp,
) -> Result<GuildCtx, Box<dyn std::error::Error + Send + Sync>> { // Use your crate's Error type here

    // 1. Try to pluck it out of the cache first
    if let Some(cache) = cache_http.cache() {
        if let Some(g) = guild_id.to_guild_cached(cache) {
            return Ok(GuildCtx {
                name: g.name.clone(),
                id: g.id.to_string(),
                icon_url: g.icon_url().unwrap_or_default(),
                icon_hash: g.icon.map(|h| h.to_string()).unwrap_or_default(),
                owner_id: g.owner_id.to_string(),
                member_count: g.member_count.to_string(),
                verification_level: u8::from(g.verification_level).to_string(),
                joined_at: g.joined_at.to_string(),
            });
        }
    }

    // 2. If it's not in cache (or we are in a worker with no cache), fallback to HTTP
    let g = cache_http.http().get_guild_with_counts(guild_id).await?;
    Ok(GuildCtx {
        name: g.name.clone(),
        id: g.id.to_string(),
        icon_url: g.icon_url().unwrap_or_default(),
        icon_hash: g.icon.map(|h| h.to_string()).unwrap_or_default(),
        owner_id: g.owner_id.to_string(),
        member_count: g.approximate_member_count.unwrap_or(0).to_string(),
        verification_level: u8::from(g.verification_level).to_string(),
        joined_at: String::new(), // HTTP fetch doesn't give us joined_at
    })
}
pub fn replace_welcome_goodbye_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: &serenity::all::Member,
    channel: &serenity::GuildChannel,
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
    channel: &serenity::GuildChannel,
    source_channel: &serenity::GuildChannel,
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


/// Retrieves settings. Returns a default struct if none exists in the DB.
pub async fn get_settings(
    db: &sqlx::PgPool,
    redis: &MultiplexedConnection,
    guild_id: i64,
) -> Result<GuildSettings, sqlx::Error> {
    let mut redis = redis.clone();

    let cache_key = format!("config:guild:{}", guild_id);

    if let Ok(Some(cached_string)) = redis.get::<_, Option<String>>(&cache_key).await {
        match serde_json::from_str::<GuildSettings>(&cached_string) {
            Ok(settings) => {
                return Ok(settings);
            }
            Err(e) => println!("Redis parse failed: {}", e),
        }
    }
    let row = sqlx::query!(
        "SELECT settings FROM guild_configs WHERE guild_id = $1",
        guild_id
    )
        .fetch_optional(db)
        .await?;

    let settings: GuildSettings = match row {
        Some(r) => match serde_json::from_value::<GuildSettings>(r.settings.clone()) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("DESERIALIZATION ERROR: {}. Raw JSON: {:?}", e, r.settings);
                GuildSettings::default()
            }
        },
        None => GuildSettings::default(),
    };

    // Populate the Redis cache with the retrieved data (TTL: 1 hour)
    if let Ok(serialized) = serde_json::to_string(&settings) {
        // Store the JSON string for 3600 seconds (1 hour)
        let _: Result<(), _> = redis.set_ex(&cache_key, serialized, 3600).await;
    }

    Ok(settings)
}