use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features;
use crate::features::message_logging::cache::{fetch_dist_cached_message, fetch_dist_edit_details};
use crate::features::message_logging::{database, filters};
use crate::features::message_logging::types::{
    CachedAuditLogs, DeletedMessagePayload, ModifiedMessagePayload,
};
use fred::interfaces::FredResult;
use serenity::all::{audit_log, ChannelId, MessageAction, MessageId, GuildId, Context, UserId};
use std::sync::Arc;
use moka::future::Cache;
use tracing::{debug, error, instrument, trace, warn};

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
        debug!("Using cached audit logs for deleter lookup");
        data
    } else {
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

        audit_cache.insert(guild_id, data.clone()).await;
        data
    };

    for entry in &audit_data.entries {
        let target_matches = entry.target_id.is_some_and(|id| id.get() == author_id.get()); // GenericId for some reason
        let mut channel_matches = false;

        if let Some(options) = &entry.options
            && let Some(entry_channel_id) = options.channel_id
            && entry_channel_id == channel_id
        {
            channel_matches = true;
        }

        if target_matches && channel_matches {
            if let Some(user) = audit_data.users.get(&entry.user_id) {
                debug!(deleter_id = %entry.user_id, deleter_name = %user.name, "Found matching deleter in cached users list");
                return Some((entry.user_id, user.name.clone()));
            }

            debug!(deleter_id = %entry.user_id, "User details not found in audit payload; resolving via API");
            if let Ok(user) = entry.user_id.to_user(&ctx.http).await {
                return Some((entry.user_id, user.name));
            }
        }
    }

    debug!("No matching audit log entry found for message delete event");
    None
}

/// Logs a deleted message, resolving the deleter via audit logs and publishing the event.
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
    trace!("Received message delete event.");
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
        None => {
            fetch_dist_cached_message(&data.core.redis, channel_id, deleted_message_id).await?
        }
    }) else {
        return Ok(());
    };

    if filters::should_exclude_from_logging(logging_config, msg.author_id, msg.chan_id, guild_id, &ctx)
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

    tokio::spawn(async move {
        debug!("Spawning background task to match deletion audit logs and insert record");

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
            error!(error = %e, "Failed to insert deleted message log into database");
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
            debug!("Publishing delete event");
            let res: FredResult<()> =
                features::message_logging::cache::publish_delete_event(redis, payload_json).await;
            if let Err(err) = res {
                warn!(error = %err, "Failed to publish delete message event!");
            }
        }
    });

    Ok(())
}

/// Logs an edited message's content change and publishes the update event.
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
    trace!("Received message update event.");

    let redis = &data.core.redis;
    let db = &data.core.db;

    let Some(guild_id) = event.guild_id else {
        debug!("Message updated outside of a guild context; skipping logging");
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
            debug!("Resolved edit details using active cache");
            Some(local_details)
        } else {
            debug!("Edit details not available locally; querying distributed Redis cache");
            fetch_dist_edit_details(redis, event).await?
        })
    else {
        warn!("Unable to retrieve message modification history; log action skipped");
        return Ok(());
    };

    if filters::should_exclude_from_logging(
        logging_config,
        details.author_id,
        details.chan_id,
        guild_id,
        ctx,
    )
        .await
    {
        debug!("Message edit logging skipped due to inclusion/exclusion filters");
        return Ok(());
    }

    debug!("Inserting message modification history into the database");
    database::insert_modified_messages(&data.core.db, &details, guild_id)
        .await?;

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
            debug!(
                "Publishing modified message payload to Redis pub/sub channel 'discord:updates'"
            );
            let pub_res: FredResult<()> =
                features::message_logging::cache::publish_edit_event(redis, payload_json).await;

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
