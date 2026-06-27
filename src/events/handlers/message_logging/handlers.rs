use super::cache::{fetch_dist_cached_message, fetch_dist_edit_details};
use crate::commands::helpers::message_logging as local_logging_helpers;
use crate::core::config::get_settings;
use crate::events::handlers::message_logging::database;
use crate::types::payloads::{DeletedMessagePayload, ModifiedMessagePayload};
use crate::types::{CachedAuditLogs, Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{audit_log, MessageAction};
use std::sync::Arc;
use tracing::{debug, error, info, instrument, warn};

#[instrument(
    skip(ctx, audit_cache),
    fields(
        guild_id = guild_id.get(),
        channel_id = channel_id.get(),
        author_id
    )
)]
async fn determine_deleter(
    ctx: &serenity::Context,
    guild_id: serenity::GuildId,
    channel_id: serenity::ChannelId,
    author_id: u64,
    audit_cache: &moka::future::Cache<u64, Arc<CachedAuditLogs>>,
) -> Option<(String, String)> {
    let guild_id_u64 = guild_id.get();

    let cached_logs = audit_cache.get(&guild_id_u64).await;

    let audit_data = match cached_logs {
        Some(data) => {
            debug!("Using cached audit logs for deleter lookup");
            data
        }
        None => {
            debug!("Audit logs cache miss. Sleeping 800ms before querying Discord API...");
            tokio::time::sleep(std::time::Duration::from_millis(800)).await;

            debug!("Requesting message delete audit logs from Discord API");
            let audit_logs = match guild_id
                .audit_logs(
                    &ctx.http,
                    Some(audit_log::Action::Message(MessageAction::Delete)),
                    None,
                    None,
                    Some(10),
                )
                .await
            {
                Ok(logs) => logs,
                Err(e) => {
                    warn!(error = %e, "Failed to retrieve audit logs from Discord API");
                    return None;
                }
            };

            let data = Arc::new(CachedAuditLogs {
                entries: audit_logs.entries,
                users: audit_logs.users,
            });

            audit_cache.insert(guild_id_u64, data.clone()).await;
            data
        }
    };

    for entry in &audit_data.entries {
        let target_matches = entry.target_id.map(|id| id.get() == author_id).unwrap_or(false);
        let mut channel_matches = false;

        if let Some(options) = &entry.options {
            if let Some(entry_channel_id) = options.channel_id {
                if entry_channel_id == channel_id {
                    channel_matches = true;
                }
            }
        }

        if target_matches && channel_matches {
            if let Some(user) = audit_data.users.get(&entry.user_id) {
                debug!(deleter_id = %entry.user_id, deleter_name = %user.name, "Found matching deleter in cached users list");
                return Some((entry.user_id.to_string(), user.name.clone()));
            }

            debug!(deleter_id = %entry.user_id, "User details not found in audit payload; resolving via API");
            if let Ok(user) = entry.user_id.to_user(&ctx.http).await {
                return Some((entry.user_id.to_string(), user.name));
            }
        }
    }

    debug!("No matching audit log entry found for message delete event");
    None
}

#[instrument(
    skip(ctx, data),
    fields(
        channel_id = channel_id.get(),
        message_id = deleted_message_id.get(),
        guild_id = ?guild_id
    )
)]
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

    let settings = get_settings(&data.db, &data.redis, &data.guild_configs, g_id).await?;
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
        None => fetch_dist_cached_message(&data.redis, *channel_id, *deleted_message_id).await?
    }) else {
        return Ok(());
    };

    if local_logging_helpers::should_exclude_from_logging(logging_config, msg.author_id, msg.chan_id, g_id, ctx).await {
        return Ok(());
    }

    // Clone the cheap Arc references and data
    let pool = data.db.clone();
    let redis = data.redis.clone();
    let audit_log_cache = data.audit_log_cache.clone();
    let ctx_clone = ctx.clone();
    let msg_clone = msg;
    let guild_id_opt = *guild_id;
    let channel_id_val = *channel_id;

    tokio::spawn(async move {
        debug!("Spawning background task to match deletion audit logs and insert record");

        let deleted_by = if let Some(g_id_raw) = guild_id_opt {
            determine_deleter(&ctx_clone, g_id_raw, channel_id_val, msg_clone.author_id as u64, &audit_log_cache).await
        } else {
            None
        };

        let joined_image_urls = msg_clone.image_urls.join(",");
        let db_res = database::insert_deleted_message(
            &pool,
            &msg_clone,
            g_id,
            &joined_image_urls,
            &deleted_by
        ).await;

        if let Err(e) = db_res {
            error!(error = %e, "Failed to insert deleted message log into database");
        }

        let payload = DeletedMessagePayload {
            id: msg_clone.msg_id.to_string(),
            guild_id: g_id.to_string(),
            author_name: msg_clone.author_name.clone(),
            content: msg_clone.content.clone(),
            channel_id: msg_clone.chan_id.to_string(),
            deleted_at: chrono::Utc::now().to_rfc3339(),
            attachment_url: joined_image_urls,
            deleted_by_id: deleted_by.clone().map(|id| id.0),
            deleted_by_name: deleted_by.map(|id| id.1),
        };

        if let Ok(payload_json) = serde_json::to_string(&payload) {
            let mut conn = redis.clone();
            let _: Result<(), _> = redis::cmd("PUBLISH")
                .arg("discord:deletes")
                .arg(payload_json)
                .query_async(&mut conn)
                .await;
        }
    });

    Ok(())
}


#[instrument(
    skip(ctx, old_if_available, new, event, data),
    fields(
        channel_id = event.channel_id.get(),
        message_id = event.id.get(),
        guild_id = ?event.guild_id
    )
)]
pub async fn message_log_update(
    ctx: &serenity::Context,
    old_if_available: Option<&serenity::Message>,
    new: Option<&serenity::Message>,
    event: &serenity::MessageUpdateEvent,
    data: &Data,
) -> Result<(), Error> {
    let Some(g_id) = event.guild_id.map(|id| id.get() as i64) else {
        debug!("Message updated outside of a guild context; skipping logging");
        return Ok(());
    };

    let settings = get_settings(&data.db, &data.redis, &data.guild_configs, g_id).await?;
    let Some(logging_config) = &settings.message_logging else {
        return Ok(());
    };

    let is_enabled = logging_config.enabled.unwrap_or(false)
        && logging_config.events.as_ref().and_then(|ev| ev.message_edit).unwrap_or(false);

    if !is_enabled {
        return Ok(());
    }

    let Some(details) = (match local_logging_helpers::extract_edit_details(old_if_available, new, event) {
        Some(local_details) => {
            debug!("Resolved edit details using active cache");
            Some(local_details)
        }
        None => {
            debug!("Edit details not available locally; querying distributed Redis cache");
            fetch_dist_edit_details(&data.redis, event).await?
        }
    }) else {
        warn!("Unable to retrieve message modification history; log action skipped");
        return Ok(());
    };

    if local_logging_helpers::should_exclude_from_logging(logging_config, details.author_id, details.chan_id, g_id, ctx).await {
        debug!("Message edit logging skipped due to inclusion/exclusion filters");
        return Ok(());
    }

    debug!("Inserting message modification history into the database");
    database::insert_modified_messages(&data.db, &details, g_id).await?;

    let payload = ModifiedMessagePayload {
        id: details.msg_id.to_string(),
        guild_id: g_id.to_string(),
        author_name: details.author_name.clone(),
        channel_id: details.chan_id.to_string(),
        old_content: details.old_content.clone(),
        new_content: details.new_content.clone(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    match serde_json::to_string(&payload) {
        Ok(payload_json) => {
            debug!("Publishing modified message payload to Redis pub/sub channel 'discord:updates'");
            let mut conn = data.redis.clone();
            let pub_res: Result<(), _> = redis::cmd("PUBLISH")
                .arg("discord:updates")
                .arg(payload_json)
                .query_async(&mut conn)
                .await;

            if let Err(e) = pub_res {
                error!(error = %e, "Failed to publish update event payload to Redis channel");
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to serialize updated message payload for Redis publication");
        }
    }

    Ok(())
}