pub mod database;

use crate::core::config::database::{get_settings_from_database, get_settings_from_redis, set_setting_to_redis};
use crate::types::config::config::GuildSettings;
use fred::clients::Client;
use poise::serenity_prelude as serenity;
use sqlx::PgPool;
use tracing::{debug, error, trace, warn};

pub struct GuildCtx {
    pub name: String,
    pub id: String,
    pub icon_url: String,
    pub icon_hash: String,
    pub owner_id: String,
    pub member_count: String,
    pub verification_level: String,
    pub joined_at: String,
}

pub async fn get_guild_ctx(
    guild_id: serenity::GuildId,
    cache_http: impl serenity::CacheHttp,
) -> Result<GuildCtx, anyhow::Error> {
    let guild_id_u64 = guild_id.get();
    trace!(guild_id = guild_id_u64, "Fetching guild context details");

    if let Some(cache) = cache_http.cache() {
        if let Some(g) = guild_id.to_guild_cached(cache) {
            trace!(guild_id = guild_id_u64, "Retrieved guild context from local cache");
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

    debug!(
        guild_id = guild_id_u64,
        "Guild context not found in local cache; executing fallback HTTP request to Discord API"
    );
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

pub async fn get_settings(
    db: &PgPool,
    redis: &Client,
    cache: &moka::future::Cache<i64, GuildSettings>,
    guild_id: i64,
) -> anyhow::Result<GuildSettings> {
    Box::pin(get_settings_inner(db, redis, cache, guild_id)).await
}

/// Retrieves settings. Returns a default struct if none exists in the DB.
pub async fn get_settings_inner(
    db: &PgPool,
    redis: &Client,
    cache: &moka::future::Cache<i64, GuildSettings>,
    guild_id: i64,
) -> anyhow::Result<GuildSettings> {
    if let Some(settings) = cache.get(&guild_id).await {
        trace!(guild_id, "Retrieved settings from memory cache");
        return Ok(settings);
    }

    let cache_key = format!("config:guild:{}", guild_id);

    if let Some(settings) = get_settings_from_redis(redis, &cache_key, guild_id).await {
        cache.insert(guild_id, settings.clone()).await;
        return Ok(settings);
    }

    debug!(guild_id, key = cache_key, "Settings cache miss; querying DB");
    let settings_db = get_settings_from_database(db, guild_id).await?;

    let settings: GuildSettings = match settings_db {
        Some(v) => match serde_json::from_value::<GuildSettings>(v.clone()) {
            Ok(s) => {
                debug!("Found config from DB.");
                s
            }
            Err(e) => {
                error!(error = ?e, guild_id, "Failed to deserialize database JSON; using default");
                GuildSettings::default()
            }
        },
        None => {
            trace!(guild_id, "No config found in database; using default settings");
            GuildSettings::default()
        }
    };

    if let Err(e) = set_setting_to_redis(&redis, &settings, &cache_key).await {
        warn!("Redis failed to cache: {:?}", e);
    }

    cache.insert(guild_id, settings.clone()).await;

    Ok(settings)
}