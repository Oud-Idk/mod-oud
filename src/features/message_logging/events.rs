use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features;
use crate::features::message_logging::cache::{fetch_dist_cached_message, fetch_dist_edit_details};
use crate::features::message_logging::types::{
    CachedAuditLogs, DeletedMessagePayload, ModifiedMessagePayload,
};
use crate::features::message_logging::{database, filters};
use crate::shared::task;
use fred::interfaces::FredResult;
use moka::future::Cache;
use serenity::all::{ChannelId, Context, GuildId, MessageAction, MessageId, UserId, audit_log};
use std::sync::Arc;
use tracing::{debug, error, instrument, warn};

#[instrument(
    skip(ctx, audit_cache),
    fields(
        %guild_id,
        channel_id = channel_id.get(),
        author_id
    )
)]
async fn determine_deleter(
    ctx: &Context,
    guild_id: GuildId,
    channel_id: ChannelId,
    author_id: UserId,
    audit_cache: &Cache<GuildId, Arc<CachedAuditLogs>>,
) -> Option<(UserId, String)> {
    let cached_logs = audit_cache.get(&guild_id).await;

    let audit_data = if let Some(data) = cached_logs {
        debug!("using cached audit logs for deleter lookup");
        data
    } else {
        debug!("audit logs cache miss; the discord api query is delayed 800ms");
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;

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
                warn!(error = %e, "message delete audit log retrieval failed");
                return None;
            }
        };

        let data = Arc::new(CachedAuditLogs {
            entries: audit_logs.entries,
            users: audit_logs.users,
        });

        audit_cache.insert(guild_id, data.clone()).await;
        data
    };

    for entry in &audit_data.entries {
        let target_matches = entry
            .target_id
            .is_some_and(|id| id.get() == author_id.get()); // GenericId for some reason
        let channel_matches = if let Some(options) = &entry.options // Has audit log actions
            && let Some(entry_channel_id) = options.channel_id // Audt log option has channel ID
            && entry_channel_id == channel_id
        {
            true
        } else {
            false
        };

        if target_matches && channel_matches {
            if let Some(user) = audit_data.users.get(&entry.user_id) {
                debug!(deleter_id = %entry.user_id, deleter_name = %user.name, "found matching deleter in cached users list");
                return Some((entry.user_id, user.name.clone()));
            }

            debug!(deleter_id = %entry.user_id, "deleter not found in the audit log payload");
            if let Ok(user) = entry.user_id.to_user(&ctx.http).await {
                return Some((entry.user_id, user.name));
            }
        }
    }

    debug!("no matching audit log entry found for message delete event");
    None
}

/// Logs a deleted message, resolving the deleter via audit logs and publishing the event.
///
/// # Errors
/// Returns an error if the guild settings cannot be loaded, the cached message
/// cannot be fetched, or the delete event fails to publish.
#[instrument(
    skip(ctx, data),
    fields(
        channel_id = channel_id.get(),
        message_id = deleted_message_id.get(),
        guild_id = ?guild_id
    )
)]
pub async fn message_log_delete(
    ctx: &Context,
    channel_id: ChannelId,
    deleted_message_id: MessageId,
    guild_id: Option<&GuildId>,
    data: &BotData,
) -> Result<(), Error> {
    let Some(guild_id) = guild_id else {
        return Ok(());
    };
    let guild_id = *guild_id;

    let settings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;
    let Some(logging_config) = &settings.message_logging else {
        return Ok(());
    };

    let is_enabled = logging_config
        .events
        .as_ref()
        .and_then(|ev| ev.message_delete)
        .unwrap_or(false);

    if !is_enabled {
        return Ok(());
    }

    let Some(msg) = (match filters::fetch_cached_message(&ctx.cache, channel_id, deleted_message_id)
    {
        Some(local_msg) => Some(local_msg),
        None => fetch_dist_cached_message(&data.core.redis, channel_id, deleted_message_id).await?,
    }) else {
        return Ok(());
    };

    if filters::should_exclude_from_logging(
        logging_config,
        msg.author_id,
        msg.chan_id,
        guild_id,
        ctx,
    )
    .await
    {
        return Ok(());
    }

    let pool = data.core.db.clone();
    let redis = data.core.redis.clone();
    let audit_log_cache = data.caches.audit_logs.clone();
    let ctx_clone = ctx.clone();
    let msg_clone = msg;
    let channel_id_val = channel_id;

    task::spawn("message_delete_audit", async move {
        let deleted_by = determine_deleter(
            &ctx_clone,
            guild_id,
            channel_id_val,
            msg_clone.author_id,
            &audit_log_cache,
        )
        .await;

        let joined_image_urls = msg_clone.image_urls.join(",");
        // Possible bottleneck here because not batching the queries
        // But, who deleted messages every 0.1 seconds anyway
        let db_res = database::insert_deleted_message(
            &pool,
            &msg_clone,
            guild_id,
            &joined_image_urls,
            deleted_by.as_ref(),
        )
        .await;

        if let Err(e) = db_res {
            error!(error = %e, "deleted message log insert failed");
        }

        let payload = DeletedMessagePayload {
            id: msg_clone.msg_id,
            guild_id,
            author_id: msg_clone.author_id,
            author_name: msg_clone.author_name.clone(),
            content: msg_clone.content.clone(),
            channel_id: msg_clone.chan_id,
            deleted_at: chrono::Utc::now().to_rfc3339(),
            attachment_url: joined_image_urls,
            deleted_by_id: deleted_by.as_ref().map(|by| by.0),
            deleted_by_name: deleted_by.as_ref().map(|by| by.1.clone()),
        };

        if let Ok(payload_json) = serde_json::to_string(&payload) {
            debug!("delete event payload published to redis");
            let res: FredResult<()> =
                features::message_logging::cache::publish_delete_event(redis, payload_json).await;
            if let Err(err) = res {
                warn!(error = %err, "delete event publish failed");
            }
        }
    });

    Ok(())
}

/// Logs an edited message's content change and publishes the update event.
///
/// # Errors
/// Returns an error if the guild settings cannot be loaded or the edit event
/// fails to publish.
#[instrument(
    skip(ctx, old_if_available, new, event, data),
    fields(
        channel_id = event.channel_id.get(),
        message_id = event.id.get(),
        guild_id = ?event.guild_id
    )
)]
pub async fn log_message_update(
    ctx: &serenity::all::Context,
    old_if_available: Option<&serenity::all::Message>,
    new: Option<&serenity::all::Message>,
    event: &serenity::all::MessageUpdateEvent,
    data: &BotData,
) -> Result<(), Error> {
    let redis = &data.core.redis;
    let db = &data.core.db;

    let Some(guild_id) = event.guild_id else {
        debug!("message updated outside of a guild context; skipping logging");
        return Ok(());
    };

    let settings = get_settings(db, redis, &data.core.guild_configs_cache, guild_id).await?;
    let Some(logging_config) = &settings.message_logging else {
        return Ok(());
    };

    let is_enabled = logging_config
        .events
        .as_ref()
        .and_then(|ev| ev.message_edit)
        .unwrap_or(false);

    if !is_enabled {
        return Ok(());
    }

    let Some(details) =
        (if let Some(local_details) = filters::extract_edit_details(old_if_available, new, event) {
            debug!("resolved edit details using active cache");
            Some(local_details)
        } else {
            debug!(fallback = "redis", "edit details not available locally");
            fetch_dist_edit_details(redis, event).await?
        })
    else {
        warn!("message modification history unavailable; log action skipped");
        return Ok(());
    };

    if details.old_content == details.new_content {
        debug!("message edit logging skipped due to identical old/new content");
        return Ok(());
    }

    if filters::should_exclude_from_logging(
        logging_config,
        details.author_id,
        details.chan_id,
        guild_id,
        ctx,
    )
    .await
    {
        debug!("message edit logging skipped due to inclusion/exclusion filters");
        return Ok(());
    }

    database::insert_modified_messages(&data.core.db, &details, guild_id).await?;
    debug!("message modification history inserted into the database");

    let payload = ModifiedMessagePayload {
        id: details.msg_id,
        guild_id,
        author_id: details.author_id,
        author_name: details.author_name.clone(),
        channel_id: details.chan_id,
        old_content: details.old_content.clone(),
        new_content: details.new_content.clone(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    match serde_json::to_string(&payload) {
        Ok(payload_json) => {
            debug!("modified message payload published to redis");
            let pub_res: FredResult<()> =
                features::message_logging::cache::publish_edit_event(redis, payload_json).await;

            if let Err(e) = pub_res {
                warn!(error = %e, "update event publish failed");
            }
        }
        Err(e) => {
            warn!(error = %e, "modified message payload serialization failed");
        }
    }

    Ok(())
}
