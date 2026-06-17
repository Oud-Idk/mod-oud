use crate::commands::helpers::message_logging;
use crate::core::config::get_settings;
use crate::types::payloads::{DeletedMessagePayload, ModifiedMessagePayload};
use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};

pub struct MessageDetails {
    pub(crate) msg_id: i64,
    pub(crate) author_id: i64,
    pub(crate) author_name: String,
    pub(crate) chan_id: i64,
    pub(crate) content: String,
    pub(crate) image_urls: Vec<String>,
}

pub struct EditDetails {
    pub(crate) msg_id: i64,
    pub(crate) chan_id: i64,
    pub(crate) author_id: i64,
    pub(crate) author_name: String,
    pub(crate) old_content: Option<String>,
    pub(crate) new_content: Option<String>,
}


#[derive(Serialize, Deserialize, Clone)]
pub struct DistributedCachedMessage {
    pub author_id: i64,
    pub author_name: String,
    pub content: String,
    pub image_urls: Vec<String>,
}

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
            // Clone the content string to preserve the `cached` struct
            let old_content = Some(cached.content.clone());
            let new_content = event.content.clone();

            if let Some(ref content) = new_content {
                // Clone the structure to update Redis without consuming the original
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
                author_name: cached.author_name, // Now safely un-moved
                old_content,
                new_content,
            }))
        }
        None => Ok(None),
    }
}

pub async fn message_log_delete(
    ctx: &serenity::Context,
    channel_id: &serenity::ChannelId,
    deleted_message_id: &serenity::MessageId,
    guild_id: &Option<serenity::GuildId>,
    _data: &Data,
) -> Result<(), Error> {
    let Some(g_id) = guild_id.map(|id| id.get() as i64) else {
        return Ok(());
    };

    let settings = get_settings(&_data.db, &_data.redis, g_id).await?;
    let Some(logging_config) = &settings.message_logging else {
        return Ok(());
    };

    let is_enabled = logging_config.enabled.unwrap_or(false)
        && logging_config.events.as_ref().and_then(|ev| ev.message_delete).unwrap_or(false);

    if !is_enabled {
        return Ok(());
    }

    // Check local memory first (zero network latency)
    // Fall back to Redis if the message was evicted or if the node restarted
    let Some(msg) = (match message_logging::fetch_cached_message(&ctx.cache, channel_id, deleted_message_id) {
        Some(local_msg) => Some(local_msg),
        None => fetch_dist_cached_message(&_data.redis, *channel_id, *deleted_message_id).await?,
    }) else {
        return Ok(());
    };

    if message_logging::should_exclude_from_logging(logging_config, msg.author_id, msg.chan_id, g_id, ctx).await {
        return Ok(());
    }

    let joined_image_urls = msg.image_urls.join(",");
    sqlx::query!(
        r#"
        INSERT INTO deleted_messages (message_id, author_id, author_name, channel_id, guild_id, content, attachment_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
        msg.msg_id,
        msg.author_id,
        msg.author_name,
        msg.chan_id,
        g_id,
        msg.content,
        joined_image_urls,
    )
        .execute(&_data.db)
        .await?;

    let payload = DeletedMessagePayload {
        id: msg.msg_id.to_string(),
        guild_id: g_id.to_string(),
        author_name: msg.author_name.clone(),
        content: msg.content.clone(),
        channel_id: msg.chan_id.to_string(),
        deleted_at: chrono::Utc::now().to_rfc3339(),
        attachment_url: joined_image_urls.to_string(),
    };

    if let Ok(payload_json) = serde_json::to_string(&payload) {
        let mut conn = _data.redis.clone();
        let _: Result<(), _> = redis::cmd("PUBLISH")
            .arg("discord:deletes")
            .arg(payload_json)
            .query_async(&mut conn)
            .await;
    }

    Ok(())
}

pub async fn message_log_update(
    ctx: &serenity::Context,
    old_if_available: Option<&serenity::Message>,
    new: Option<&serenity::Message>,
    event: &serenity::MessageUpdateEvent,
    _data: &Data,
) -> Result<(), Error> {
    let Some(g_id) = event.guild_id.map(|id| id.get() as i64) else {
        return Ok(());
    };

    let settings = get_settings(&_data.db, &_data.redis, g_id).await?;
    let Some(logging_config) = &settings.message_logging else {
        return Ok(());
    };

    let is_enabled = logging_config.enabled.unwrap_or(false)
        && logging_config.events.as_ref().and_then(|ev| ev.message_edit).unwrap_or(false);

    if !is_enabled {
        return Ok(());
    }

    let Some(details) = (match message_logging::extract_edit_details(old_if_available, new, event) {
        Some(local_details) => Some(local_details),
        None => fetch_dist_edit_details(&_data.redis, event).await?,
    }) else {
        return Ok(());
    };

    if message_logging::should_exclude_from_logging(logging_config, details.author_id, details.chan_id, g_id, ctx).await {
        return Ok(());
    }

    sqlx::query!(
        r#"
        INSERT INTO modified_messages (message_id, author_id, author_name, channel_id, guild_id, old_content, new_content)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
        details.msg_id,
        details.author_id,
        details.author_name,
        details.chan_id,
        g_id,
        details.old_content.as_deref(),
        details.new_content.as_deref(),
    )
        .execute(&_data.db)
        .await?;

    let payload = ModifiedMessagePayload {
        id: details.msg_id.to_string(),
        guild_id: g_id.to_string(),
        author_name: details.author_name.clone(),
        channel_id: details.chan_id.to_string(),
        old_content: details.old_content.clone(),
        new_content: details.new_content.clone(),
        edited_at: chrono::Utc::now().to_rfc3339(),
    };

    if let Ok(payload_json) = serde_json::to_string(&payload) {
        let mut conn = _data.redis.clone();
        let _: Result<(), _> = redis::cmd("PUBLISH")
            .arg("discord:updates")
            .arg(payload_json)
            .query_async(&mut conn)
            .await;
    }

    Ok(())
}