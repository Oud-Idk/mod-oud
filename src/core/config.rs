use crate::types::config::config::GuildSettings;
use poise::serenity_prelude as serenity;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
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
) -> Result<GuildCtx, Box<dyn std::error::Error + Send + Sync>> {
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

/// Retrieves settings. Returns a default struct if none exists in the DB.
pub async fn get_settings(
    db: &sqlx::PgPool,
    redis: &MultiplexedConnection,
    cache: &moka::future::Cache<i64, GuildSettings>, // Accept the Moka cache reference
    guild_id: i64,
) -> Result<GuildSettings, sqlx::Error> {
    if let Some(settings) = cache.get(&guild_id).await {
        trace!(guild_id, "Retrieved settings from memory cache");
        return Ok(settings);
    }

    let mut redis_conn = redis.clone();
    let cache_key = format!("config:guild:{}", guild_id);

    trace!(guild_id, key = %cache_key, "Fetching guild settings configuration");

    // 2. Try checking the Redis L2 cache
    if let Ok(Some(cached_string)) = redis_conn.get::<_, Option<String>>(&cache_key).await {
        match serde_json::from_str::<GuildSettings>(&cached_string) {
            Ok(settings) => {
                trace!(guild_id, key = %cache_key, "Retrieved settings from Redis cache");

                // Write back to local memory L1 cache
                cache.insert(guild_id, settings.clone()).await;
                return Ok(settings);
            }
            Err(e) => {
                warn!(
                    error = ?e,
                    guild_id,
                    key = %cache_key,
                    "Failed to parse settings from Redis; falling back to DB"
                );
            }
        }
    }

    debug!(guild_id, key = %cache_key, "Settings cache miss; querying DB");
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
                error!(error = ?e, guild_id, "Failed to deserialize database JSON; using default");
                GuildSettings::default()
            }
        },
        None => {
            trace!(guild_id, "No config found in database; using default settings");
            GuildSettings::default()
        }
    };

    // 3. Cache settings into Redis (L2 Cache, 1 hour TTL)
    if let Ok(serialized) = serde_json::to_string(&settings) {
        let _: Result<(), _> = redis_conn.set_ex(&cache_key, serialized, 3600).await;
    }

    // 4. Cache settings into local memory (L1 Cache)
    cache.insert(guild_id, settings.clone()).await;

    Ok(settings)
}