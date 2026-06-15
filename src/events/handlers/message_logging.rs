use crate::commands::helpers::message_logging;
use crate::core::config::get_settings;
use crate::types::types::{Data, DeletedMessagePayload, Error, ModifiedMessagePayload};
use poise::serenity_prelude as serenity;

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

    let is_enabled = logging_config
        .enabled
        .unwrap_or(false)
        && logging_config
        .events
        .as_ref()
        .and_then(|ev| ev.message_delete)
        .unwrap_or(false);

    if !is_enabled {
        return Ok(());
    }

    let Some(msg) =
        message_logging::fetch_cached_message(&ctx.cache, channel_id, deleted_message_id)
    else {
        return Ok(());
    };

    if message_logging::should_exclude_from_logging(
        logging_config,
        msg.author_id,
        msg.chan_id,
        g_id,
        ctx,
    )
        .await
    {
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

    let is_enabled = logging_config
        .enabled
        .unwrap_or(false)
        && logging_config
        .events
        .as_ref()
        .and_then(|ev| ev.message_edit)
        .unwrap_or(false);

    if !is_enabled {
        return Ok(());
    }

    let Some(details) = message_logging::extract_edit_details(old_if_available, new, event) else {
        return Ok(());
    };

    // Check if message should be excluded from logging
    if message_logging::should_exclude_from_logging(
        logging_config,
        details.author_id,
        details.chan_id,
        g_id,
        ctx,
    )
        .await
    {
        return Ok(());
    }

    // 3. Log modified messages in database
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

    // 4. Publish to Redis for real-time web delivery
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