use super::types::{DistributedCachedMessage, EditDetails, MessageDetails};
use crate::types::Error;
use poise::serenity_prelude as serenity;

/// Proactively cache newly created messages in Redis with a 24-hour expiration
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

    let serialized = serde_json::to_string(&cached)?;
    let key = format!("msg:{}:{}", msg.channel_id.get(), msg.id.get());

    // Set with a 24-hour (86400 seconds) expiration to prevent Redis memory exhaustion
    let _: () = redis::cmd("SET")
        .arg(&key)
        .arg(serialized)
        .arg("EX")
        .arg(86400)
        .query_async(&mut conn)
        .await?;

    Ok(())
}

/// Retrieve a deleted message's details from the distributed Redis cache
pub async fn fetch_dist_cached_message(
    redis_conn: &redis::aio::MultiplexedConnection,
    channel_id: serenity::ChannelId,
    message_id: serenity::MessageId,
) -> Result<Option<MessageDetails>, Error> {
    let mut conn = redis_conn.clone();
    let key = format!("msg:{}:{}", channel_id.get(), message_id.get());

    let val: Option<String> = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut conn)
        .await?;

    match val {
        Some(raw) => {
            let cached: DistributedCachedMessage = serde_json::from_str(&raw)?;
            Ok(Some(MessageDetails {
                msg_id: message_id.get() as i64,
                author_id: cached.author_id,
                author_name: cached.author_name,
                chan_id: channel_id.get() as i64,
                content: cached.content,
                image_urls: cached.image_urls,
            }))
        }
        None => Ok(None),
    }
}

/// Retrieve and update a message's details during an edit event
pub async fn fetch_dist_edit_details(
    redis_conn: &redis::aio::MultiplexedConnection,
    event: &serenity::MessageUpdateEvent,
) -> Result<Option<EditDetails>, Error> {
    let mut conn = redis_conn.clone();
    let key = format!("msg:{}:{}", event.channel_id.get(), event.id.get());

    let val: Option<String> = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut conn)
        .await?;

    match val {
        Some(raw) => {
            let cached: DistributedCachedMessage = serde_json::from_str(&raw)?;
            let old_content = Some(cached.content.clone());
            let new_content = event.content.clone();

            if let Some(ref content) = new_content {
                let mut updated = cached.clone();
                updated.content = content.clone();

                let serialized = serde_json::to_string(&updated)?;
                let _: () = redis::cmd("SET")
                    .arg(&key)
                    .arg(serialized)
                    .arg("EX")
                    .arg(86400) // Reset TTL
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
        None => Ok(None),
    }
}