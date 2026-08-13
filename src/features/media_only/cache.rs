use crate::core::config::state::BotData;
use crate::features::media_only::database::{
    delete_media_only_from_db, fetch_media_only_from_db, store_media_only_in_db,
};
use crate::features::media_only::keys;
use crate::features::media_only::types::MediaOnlyChannel;
use anyhow::Context as _;
use anyhow::Result;
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::types::Expiration;
use serenity::all::ChannelId;
use sqlx::PgPool;
use tracing::{trace, warn};

pub async fn store_media_only_channel_redis(
    redis: &Client,
    payload: &MediaOnlyChannel,
) -> Result<()> {
    let key = keys::media_channel_key(ChannelId::from(payload.channel_id as u64));
    let payload_ser = serde_json::to_string(payload)?;
    redis
        .set(&key, payload_ser, Some(Expiration::EX(3600)), None, false)
        .await
        .context("Failed to store media channel in cache")
}

pub async fn store_negative_media_channel(redis: &Client, channel_id: ChannelId) -> Result<()> {
    let key = keys::media_channel_key(channel_id);
    redis
        .set(&key, "null", Some(Expiration::EX(60)), None, false)
        .await
        .context("Failed to store media channel in cache")
}

pub async fn get_channel_media(
    data: &BotData,
    channel_id: ChannelId,
) -> Result<Option<MediaOnlyChannel>> {
    let redis = &data.core.redis;
    let key = keys::media_channel_key(channel_id);

    trace!("Getting media channel from cache");
    let media_channel: Option<String> = redis.get(&key).await?;
    if let Some(payload) = media_channel {
        let media_channel = serde_json::from_str::<Option<MediaOnlyChannel>>(&payload)
            .context("Failed to deserialize media only channel")?;
        return Ok(media_channel);
    }

    // Not found in Redis
    trace!("Cache miss; getting from DB");
    let media_channel_from_db = fetch_media_only_from_db(&data.core.db, channel_id).await?;
    if let Some(media_channel_from_db) = media_channel_from_db {
        let _ = store_media_only_channel_redis(redis, &media_channel_from_db)
            .await
            .inspect_err(|e| warn!(error = ?e, "Failed to store media only channel in redis")); // Redis is not too important, ignore Err
        return Ok(Some(media_channel_from_db));
    }

    let _ = store_negative_media_channel(redis, channel_id)
        .await
        .inspect_err(|e| warn!(error = ?e, "Failed to store negative media only channel in redis")); // Same for here

    Ok(None)
}

pub async fn delete_media_only_channel(data: &BotData, channel_id: ChannelId) -> Result<bool> {
    let redis = &data.core.redis;
    let db = &data.core.db;

    let rows_affected = delete_media_only_from_db(db, channel_id).await?;
    if rows_affected == 0 {
        return Ok(false);
    }

    let _ = store_negative_media_channel(redis, channel_id)
        .await
        .inspect_err(|e| warn!(error = ?e, "Failed to delete media channel from cache"))
        .inspect_err(|e| warn!(error = ?e, "Failed to store media only channel in redis"));

    Ok(true)
}

pub async fn store_media_only_channel(
    db: &PgPool,
    redis: &Client,
    payload: MediaOnlyChannel,
) -> Result<()> {
    store_media_only_in_db(db, &payload).await?;
    let _ = store_media_only_channel_redis(redis, &payload)
        .await
        .inspect_err(|e| warn!(error = ?e, "Failed to store media only channel in redis"));

    Ok(())
}
