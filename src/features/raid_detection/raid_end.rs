use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::moderation::apply_global_unlock;
use crate::features::raid_detection::database;
use crate::features::raid_detection::snapshot::restore_preraid_state;
use crate::features::raid_detection::types::{RaidAction, RaidEventType};
use crate::features::raid_detection::{RaidDetectionConfig, cache};
use serenity::all::{
    ChannelId, Context, CreateMessage, EditGuildIncidentActions, GuildId, Timestamp,
};
use tracing::{error, info, warn};

pub fn spawn_raid_end_monitor(ctx: Context, data: BotData, guild_id: GuildId) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

            let is_active: bool = match cache::check_raid_active(&data.core.redis, guild_id).await {
                Ok(active) => active,
                Err(e) => {
                    error!(error = ?e, "Failed to check raid status in Redis");
                    continue;
                }
            };

            if !is_active {
                info!("Raid ended for guild {guild_id}. Reverting actions...");
                if let Err(e) = handle_raid_end(&ctx, &data, guild_id).await {
                    error!(error = ?e, "Error executing raid end cleanup for guild {guild_id}");
                }
                break; // Exit loop once raid end cleanup completes
            }
        }
    });
}

pub async fn handle_raid_end(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
) -> Result<(), Error> {
    let restored = restore_preraid_state(ctx, data, guild_id)
        .await
        .inspect_err(
            |e| error!(error = ?e, "Failed to restore pre-raid state for guild {guild_id}"),
        )
        .unwrap_or(false);

    if !restored {
        return Ok(());
    }

    // Delete persisted active raid state from Postgres
    if let Err(e) = database::delete_active_raid_state(&data.core.db, guild_id).await {
        error!(error = ?e, %guild_id, "Failed to delete active raid state from database");
    }

    // Log the resolve event
    if let Err(e) =
        database::log_raid_event(&data.core.db, guild_id, RaidEventType::Resolved, None).await
    {
        error!(error = ?e, %guild_id, "Failed to log raid resolve event");
    }

    let Some(raid_config) = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?
    .raid_detection
    else {
        return Ok(());
    };

    revert_actions(&ctx, data, guild_id, &raid_config).await?;

    Ok(())
}

async fn revert_actions(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
    raid_config: &Box<RaidDetectionConfig>,
) -> Result<(), Error> {
    for action in &raid_config.raid_actions {
        match action {
            RaidAction::LockdownServer => {
                let ctx = ctx.clone();
                let data = (*data).clone();
                tokio::spawn(async move {
                    if let Err(e) = apply_global_unlock(&ctx, &data, guild_id).await {
                        error!(error = ?e, "Failed to lift global lock on raid end");
                    }
                });
            }
            RaidAction::PauseInvites { .. } => {
                let past_timestamp = Timestamp::from_unix_timestamp(0)?;
                let builder =
                    EditGuildIncidentActions::new().invites_disabled_until(past_timestamp);

                if let Err(e) = guild_id
                    .edit_guild_incident_actions(&ctx.http, guild_id, builder)
                    .await
                {
                    error!(error = ?e, "Failed to unpause invites on raid end");
                }
            }
            RaidAction::Alert { channel_id } => {
                let channel = ChannelId::new(*channel_id);
                let message = CreateMessage::new().content(
                    "**Raid Resolved**: Join rate has stabilized back to safe levels. Reverted incident actions and lockdown state."
                );
                let _ = channel.send_message(&ctx.http, message).await;
            }
            _ => {}
        }
    }
    Ok(())
}

/// Re-attaches raid monitors or reverts stale raid state for tracked guilds at startup.
///
/// Checks Redis first; if Redis is empty (e.g. after a Redis restart), falls back
/// to the Postgres `raid_active_state` table to recover active raids.
///
/// # Errors
/// Returns an error if the Redis or database read fails.
pub async fn reconcile_active_raids(ctx: &Context, data: &BotData) -> Result<(), Error> {
    // First, try to reconcile from Redis (fast path)
    let tracked_guilds = cache::get_active_raids(&data.core.redis).await?;

    for guild_id in &tracked_guilds {
        let is_active = cache::check_raid_active(&data.core.redis, *guild_id)
            .await
            .unwrap_or(false);

        if is_active {
            info!("Re-attaching raid monitor for active raid in guild {guild_id}");
            spawn_raid_end_monitor(ctx.clone(), (*data).clone(), *guild_id);
        } else {
            info!("Found stale raid tracking for guild {guild_id}. Reverting state...");
            if let Err(e) = handle_raid_end(ctx, data, *guild_id).await {
                error!(
                    error = ?e,
                    "Failed to restore state during startup reconciliation for guild {guild_id}"
                );
            }
        }
    }

    // If Redis had no tracked guilds, check Postgres for active raids that survived a Redis flush
    if tracked_guilds.is_empty() {
        let db_guilds = database::get_all_active_raid_guilds(&data.core.db).await?;

        if !db_guilds.is_empty() {
            info!(
                count = db_guilds.len(),
                "Redis empty; recovering active raids from database"
            );
        }

        for guild_id in db_guilds {
            // Check if this guild's raid is still "active" by re-saving to Redis and attaching monitor
            info!(
                %guild_id,
                "Recovering active raid from database; re-attaching monitor"
            );

            // Re-populate Redis active raids set and snapshot
            if let Ok(Some(snapshot)) =
                database::load_active_raid_state(&data.core.db, guild_id).await
            {
                let snapshot_json = match serde_json::to_string(&snapshot) {
                    Ok(j) => j,
                    Err(e) => {
                        error!(error = ?e, %guild_id, "Failed to serialize snapshot for Redis recovery");
                        continue;
                    }
                };

                let _ =
                    cache::save_preraid_snapshot(&data.core.redis, guild_id, &snapshot_json).await;
                let _ = cache::add_guild_to_raid(guild_id, &data.core.redis).await;

                // Try to set raid active; if it fails (e.g. another instance already has it), skip
                match cache::try_set_raid_active(&data.core.redis, guild_id, 300).await {
                    Ok(true) => {
                        spawn_raid_end_monitor(ctx.clone(), (*data).clone(), guild_id);
                    }
                    Ok(false) => {
                        info!(%guild_id, "Raid already tracked by another instance; skipping");
                    }
                    Err(e) => {
                        error!(error = ?e, %guild_id, "Failed to set raid active during recovery");
                    }
                }
            } else {
                warn!(%guild_id, "Active raid in database but no snapshot found; cleaning up");
                if let Err(e) = database::delete_active_raid_state(&data.core.db, guild_id).await {
                    error!(error = ?e, %guild_id, "Failed to clean up orphaned raid state");
                }
            }
        }
    }

    Ok(())
}
