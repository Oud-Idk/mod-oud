use crate::types::config::GuildSettings;
use crate::types::types::Error;
use poise::serenity_prelude as serenity;
use rand::RngExt;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use regex::{Captures, Regex};
use std::sync::OnceLock;

pub struct GuildCtx {
    name: String,
    id: String,
    icon_url: String,
    icon_hash: String,
    owner_id: String,
    member_count: String,
    verification_level: String,
    joined_at: String,
}

pub async fn get_guild_ctx(
    member: &serenity::all::Member,
    ctx: &serenity::Context,
) -> Result<GuildCtx, Error> {
    if let Some(g) = member.guild_id.to_guild_cached(&ctx.cache) {
        Ok(GuildCtx {
            name: g.name.clone(),
            id: g.id.to_string(),
            icon_url: g.icon_url().unwrap_or_default(),
            icon_hash: g.icon.map(|h| h.to_string()).unwrap_or_default(),
            owner_id: g.owner_id.to_string(),
            member_count: g.member_count.to_string(),
            verification_level: u8::from(g.verification_level).to_string(),
            joined_at: g.joined_at.to_string(),
        })
    } else {
        let g = ctx.http.get_guild_with_counts(member.guild_id).await?;
        Ok(GuildCtx {
            name: g.name.clone(),
            id: g.id.to_string(),
            icon_url: g.icon_url().unwrap_or_default(),
            icon_hash: g.icon.map(|h| h.to_string()).unwrap_or_default(),
            owner_id: g.owner_id.to_string(),
            member_count: g.approximate_member_count.unwrap_or(0).to_string(),
            verification_level: u8::from(g.verification_level).to_string(),
            joined_at: String::new(), // Not available on PartialGuild
        })
    }
}

pub fn replace_placeholders(
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

/// Retrieves settings. Returns a default struct if none exists in the DB.
pub async fn get_settings(
    db: &sqlx::PgPool,
    redis: &MultiplexedConnection, // 1. Passed as an immutable reference
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