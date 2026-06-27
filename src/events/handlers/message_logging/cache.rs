use super::types::{DistributedCachedMessage, EditDetails, MessageDetails};
use crate::types::Error;
use poise::serenity_prelude as serenity;
use tracing::{debug, error, instrument};

#[instrument(
    skip(redis_conn, msg),
    fields(
        message_id = msg.id.get(),
        channel_id = msg.channel_id.get(),
        author_id = msg.author.id.get()
    )
)]
pub async fn cache_message_in_redis(
    redis_conn: &redis::aio::MultiplexedConnection,
    msg: &serenity::Message,
) -> Result<(), Error> {
    let mut conn = redis_conn.clone();
    let cached = DistributedCachedMessage {
        author_id: msg.author.id.get() as i64,
        author_name: msg.author.name.clone(),
        content: msg.content.clone(),
        image_urls: msg.attachments.iter().map(|a| a.url.clone()).collect(),
    };

    let serialized = match serde_json::to_string(&cached) {
        Ok(s) => s,
        Err(e) => {
            error!(error = %e, "Failed to serialize message for Redis caching");
            return Err(e.into());
        }
    };

    let key = format!("msg:{}:{}", msg.channel_id.get(), msg.id.get());

    let _: () = redis::cmd("SET")
        .arg(&key)
        .arg(serialized)
        .arg("EX")
        .arg(18000)
        .query_async(&mut conn)
        .await?;

    debug!(key = %key, "Message successfully cached in Redis");
    Ok(())
}

/// Retrieve a deleted message's details from the distributed Redis cache
#[instrument(
    skip(redis_conn),
    fields(
        channel_id = channel_id.get(),
        message_id = message_id.get()
    )
)]
pub async fn fetch_dist_cached_message(
    redis_conn: &redis::aio::MultiplexedConnection,
    channel_id: serenity::ChannelId,
    message_id: serenity::MessageId,
) -> Result<Option<MessageDetails>, Error> {
    let mut conn = redis_conn.clone();
    let key = format!("msg:{}:{}", channel_id.get(), message_id.get());

    debug!(key = %key, "Fetching message from Redis distributed cache");

    let val: Option<String> = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut conn)
        .await?;

    match val {
        Some(raw) => {
            debug!(key = %key, "Redis cache hit");
            let cached: DistributedCachedMessage = match serde_json::from_str(&raw) {
                Ok(c) => c,
                Err(e) => {
                    error!(error = %e, key = %key, "Failed to deserialize cached message JSON");
                    return Err(e.into());
                }
            };

            Ok(Some(MessageDetails {
                msg_id: message_id.get() as i64,
                author_id: cached.author_id,
                author_name: cached.author_name,
                chan_id: channel_id.get() as i64,
                content: cached.content,
                image_urls: cached.image_urls,
            }))
        }
        None => {
            debug!(key = %key, "Redis cache miss");
            Ok(None)
        }
    }
}

/// Retrieve and update a message's details during an edit event
#[instrument(
    skip(redis_conn, event),
    fields(
        channel_id = event.channel_id.get(),
        message_id = event.id.get()
    )
)]
pub async fn fetch_dist_edit_details(
    redis_conn: &redis::aio::MultiplexedConnection,
    event: &serenity::MessageUpdateEvent,
) -> Result<Option<EditDetails>, Error> {
    let mut conn = redis_conn.clone();
    let key = format!("msg:{}:{}", event.channel_id.get(), event.id.get());

    debug!(key = %key, "Fetching pre-edit message details from Redis");

    let val: Option<String> = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut conn)
        .await?;

    match val {
        Some(raw) => {
            debug!(key = %key, "Redis cache hit for edit details");
            let cached: DistributedCachedMessage = match serde_json::from_str(&raw) {
                Ok(c) => c,
                Err(e) => {
                    error!(error = %e, key = %key, "Failed to deserialize cached message JSON during edit");
                    return Err(e.into());
                }
            };

            let old_content = Some(cached.content.clone());
            let new_content = event.content.clone();

            if let Some(ref content) = new_content {
                debug!(key = %key, "Updating cached content and resetting TTL in Redis");
                let mut updated = cached.clone();
                updated.content = content.clone();

                let serialized = match serde_json::to_string(&updated) {
                    Ok(s) => s,
                    Err(e) => {
                        error!(error = %e, "Failed to serialize updated message details");
                        return Err(e.into());
                    }
                };

                let _: () = redis::cmd("SET")
                    .arg(&key)
                    .arg(serialized)
                    .arg("EX")
                    .arg(18000) // Reset TTL
                    .query_async(&mut conn)
                    .await?;
            }

            Ok(Some(EditDetails {
                msg_id: event.id.get() as i64,
                chan_id: event.channel_id.get() as i64,
                author_id: cached.author_id,
                author_name: cached.author_name,
                old_content,
                new_content,
            }))
        }
        None => {
            debug!(key = %key, "Redis cache miss for edit details");
            Ok(None)
        }
    }
}