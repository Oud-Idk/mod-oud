use super::cache::{fetch_dist_cached_message, fetch_dist_edit_details};
use crate::commands::helpers::message_logging as local_logging_helpers;
use crate::core::config::get_settings;
use crate::events::handlers::message_logging::database;
use crate::types::payloads::{DeletedMessagePayload, ModifiedMessagePayload};
use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{audit_log, MessageAction};

async fn determine_deleter(
    ctx: &serenity::Context,
    guild_id: serenity::GuildId,
    channel_id: serenity::ChannelId,
    author_id: u64,
) -> Option<(String, String)> {
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;

    let audit_logs = guild_id
        .audit_logs(
            &ctx.http,
            Some(audit_log::Action::Message(
                MessageAction::Delete,
            ),
            ),
            None,
            None,
            Some(5),
        )
        .await
        .ok()?;

    for entry in audit_logs.entries {
        // Check if the target is the author of the deleted message
        let target_matches = entry.target_id.map(|id| id.get() == author_id).unwrap_or(false);

        // Check if the channel matches
        let mut channel_matches = false;
        if let Some(options) = &entry.options {
            if let Some(entry_channel_id) = options.channel_id {
                if entry_channel_id == channel_id {
                    channel_matches = true;
                }
            }
        }

        if target_matches && channel_matches {
            if let Some(user) = audit_logs.users.get(&entry.user_id) {
                return Some((entry.user_id.to_string(), user.name.clone()));
            }

            if let Ok(user) = entry.user_id.to_user(&ctx.http).await {
                return Some((entry.user_id.to_string(), user.name));
            }
        }
    }

    None
}

pub async fn message_log_delete(
    ctx: &serenity::Context,
    channel_id: &serenity::ChannelId,
    deleted_message_id: &serenity::MessageId,
    guild_id: &Option<serenity::GuildId>,
    data: &Data,
) -> Result<(), Error> {
    let Some(g_id) = guild_id.map(|id| id.get() as i64) else {
        return Ok(());
    };

    let settings = get_settings(&data.db, &data.redis, g_id).await?;
    let Some(logging_config) = &settings.message_logging else {
        return Ok(());
    };

    let is_enabled = logging_config.enabled.unwrap_or(false)
        && logging_config.events.as_ref().and_then(|ev| ev.message_delete).unwrap_or(false);

    if !is_enabled {
        return Ok(());
    }

    let Some(msg) = (match local_logging_helpers::fetch_cached_message(&ctx.cache, channel_id, deleted_message_id) {
        Some(local_msg) => Some(local_msg),
        None => fetch_dist_cached_message(&data.redis, *channel_id, *deleted_message_id).await?,
    }) else {
        return Ok(());
    };

    let deleted_by = if let Some(g_id_raw) = guild_id {
        determine_deleter(ctx, *g_id_raw, *channel_id, msg.author_id as u64)
            .await
    } else {
        None
    };

    if local_logging_helpers::should_exclude_from_logging(logging_config, msg.author_id, msg.chan_id, g_id, ctx).await {
        return Ok(());
    }

    let joined_image_urls = msg.image_urls.join(",");
    database::insert_deleted_message(&data.db, &msg, g_id, &joined_image_urls, &deleted_by).await?;

    let payload = DeletedMessagePayload {
        id: msg.msg_id.to_string(),
        guild_id: g_id.to_string(),
        author_name: msg.author_name.clone(),
        content: msg.content.clone(),
        channel_id: msg.chan_id.to_string(),
        deleted_at: chrono::Utc::now().to_rfc3339(),
        attachment_url: joined_image_urls.to_string(),
        deleted_by_id: deleted_by.clone().map(|id| id.0),
        deleted_by_name: deleted_by.map(|name| name.1), // clone later if we need to reuse deleted_by
    };

    if let Ok(payload_json) = serde_json::to_string(&payload) {
        let mut conn = data.redis.clone();
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
    data: &Data,
) -> Result<(), Error> {
    let Some(g_id) = event.guild_id.map(|id| id.get() as i64) else {
        return Ok(());
    };

    let settings = get_settings(&data.db, &data.redis, g_id).await?;
    let Some(logging_config) = &settings.message_logging else {
        return Ok(());
    };

    let is_enabled = logging_config.enabled.unwrap_or(false)
        && logging_config.events.as_ref().and_then(|ev| ev.message_edit).unwrap_or(false);

    if !is_enabled {
        return Ok(());
    }

    let Some(details) = (match local_logging_helpers::extract_edit_details(old_if_available, new, event) {
        Some(local_details) => Some(local_details),
        None => fetch_dist_edit_details(&data.redis, event).await?,
    }) else {
        return Ok(());
    };

    if local_logging_helpers::should_exclude_from_logging(logging_config, details.author_id, details.chan_id, g_id, ctx).await {
        return Ok(());
    }

    database::insert_modified_messages(&data.db, &details, g_id).await?;

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
        let mut conn = data.redis.clone();
        let _: Result<(), _> = redis::cmd("PUBLISH")
            .arg("discord:updates")
            .arg(payload_json)
            .query_async(&mut conn)
            .await;
    }

    Ok(())
}

