use crate::events::handlers::temp_voice::TempVoiceHub;
use crate::types::Error;
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::prelude::Expiration;
use serenity::all::{ChannelId, GuildId};
use sqlx::PgPool;
use tracing::warn;

pub async fn get_hub_and_cache(guild_id: GuildId, redis: &Client, db: &PgPool, target_channel_id: ChannelId, cache_key: &str) -> Result<Option<TempVoiceHub>, Error> {
    let hub = get_hub_from_db(guild_id, db, target_channel_id).await?;

    if let Ok(json_str) = serde_json::to_string(&hub) {
        let ttl = if hub.is_some() { 86400 } else { 300 };
        match redis.set::<(), _, _>(cache_key, &json_str, Some(Expiration::EX(ttl)), None, false).await {
            Err(e) => { warn!("Error when writing cache to redis! {}", e) }
            _ => {}
        }
    }
    Ok(hub)
}

// why is the ordering backwards smh
pub async fn get_hub_from_db(guild_id: GuildId, db: &PgPool, target_channel_id: ChannelId) -> Result<Option<TempVoiceHub>, Error> {
    let hub = sqlx::query_as!(
        TempVoiceHub,
        r#"
        SELECT id, name, category_id, user_limit, default_channel_name
        FROM temp_voice_hubs
        WHERE guild_id = $1 AND hub_channel_id = $2
        "#,
        guild_id.get() as i64,
        target_channel_id.get() as i64,
    )
        .fetch_optional(db)
        .await?;
    Ok(hub)
}

pub async fn get_hub_info(guild_id: GuildId, redis: &Client, db: &PgPool, target_channel_id: ChannelId, cache_key: &String, cached_json: Option<String>) -> Result<Option<TempVoiceHub>, Error> {
    Ok(match cached_json {
        Some(json_str) => match serde_json::from_str::<Option<TempVoiceHub>>(&json_str) {
            Ok(hub) => hub, // valid cache hit
            Err(e) => { // malformed body, then we refetch and invalidate and stuff
                warn!(error = %e, cache_key = %cache_key, "Corrupt cache entry, falling back to DB");
                get_hub_and_cache(guild_id, redis, db, target_channel_id, &cache_key).await?
            }
        }
        None => {
            // simple miss
            get_hub_and_cache(guild_id, redis, db, target_channel_id, &cache_key).await?
        }
    })
}

pub async fn get_hub_from_db_by_category(
    guild_id: GuildId,
    db: &PgPool,
    category_id: ChannelId
) -> Result<Option<TempVoiceHub>, Error> {
    let hub = sqlx::query_as!(
        TempVoiceHub,
        r#"
        SELECT id, name, category_id, user_limit, default_channel_name
        FROM temp_voice_hubs
        WHERE guild_id = $1 AND category_id = $2
        "#,
        guild_id.get() as i64,
        category_id.get() as i64,
    )
        .fetch_optional(db)
        .await?;
    Ok(hub)
}

pub async fn get_hub_and_cache_by_category(
    guild_id: GuildId,
    redis: &Client,
    db: &PgPool,
    category_id: ChannelId,
    cache_key: &str
) -> Result<Option<TempVoiceHub>, Error> {
    let hub = get_hub_from_db_by_category(guild_id, db, category_id).await?;

    if let Ok(json_str) = serde_json::to_string(&hub) {
        let ttl = if hub.is_some() { 86400 } else { 300 };
        match redis.set::<(), _, _>(cache_key, &json_str, Some(Expiration::EX(ttl)), None, false).await {
            Err(e) => { warn!("Error when writing cache to redis! {}", e) }
            _ => {}
        }
    }
    Ok(hub)
}

pub async fn get_hub_info_by_category(
    guild_id: GuildId,
    redis: &Client,
    db: &PgPool,
    category_id: ChannelId,
    cache_key: &String,
    cached_json: Option<String>
) -> Result<Option<TempVoiceHub>, Error> {
    Ok(match cached_json {
        Some(json_str) => match serde_json::from_str::<Option<TempVoiceHub>>(&json_str) {
            Ok(hub) => hub, // valid cache hit
            Err(e) => { // malformed body, then we refetch and invalidate
                warn!(error = %e, cache_key = %cache_key, "Corrupt cache entry, falling back to DB");
                get_hub_and_cache_by_category(guild_id, redis, db, category_id, &cache_key).await?
            }
        }
        None => {
            // simple miss
            get_hub_and_cache_by_category(guild_id, redis, db, category_id, &cache_key).await?
        }
    })
}