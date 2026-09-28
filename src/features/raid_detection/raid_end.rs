use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::moderation::apply_global_unlock;
use crate::features::raid_detection::audit;
use crate::features::raid_detection::database;
use crate::features::raid_detection::snapshot::restore_preraid_state;
use crate::features::raid_detection::types::{RaidAction, RaidEventType};
use crate::features::raid_detection::{RaidDetectionConfig, cache};
use crate::shared::task;
use serenity::all::{
    ChannelId, Context, CreateMessage, EditGuildIncidentActions, GuildId, Timestamp,
};
use tracing::{error, info, warn};

pub fn spawn_raid_end_monitor(ctx: Context, data: BotData, guild_id: GuildId) {
    task::spawn("raid_end_monitor", async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

            let is_active: bool = match cache::check_raid_active(&data.core.redis, guild_id).await {
                Ok(active) => active,
                Err(e) => {
                    warn!(error = ?e, %guild_id, "raid status check in redis failed");
                    continue;
                }
            };

            if !is_active {
                info!(%guild_id, "raid no longer active");
                if let Err(e) = handle_raid_end(&ctx, &data, guild_id).await {
                    error!(%guild_id, error = ?e, "raid end cleanup failed");
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
        .inspect_err(|e| error!(%guild_id, error = ?e, "pre-raid state restore failed"))
        .unwrap_or(false);

    if !restored {
        return Ok(());
    }

    // Delete persisted active raid state from Postgres
    if let Err(e) = database::delete_active_raid_state(&data.core.db, guild_id).await {
        error!(error = ?e, %guild_id, "active raid state row not deleted from database");
    }

    // Log the resolve event
    if let Err(e) =
        database::log_raid_event(&data.core.db, guild_id, RaidEventType::Resolved, None).await
    {
        error!(error = ?e, %guild_id, "raid resolve event log write failed");
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

    revert_actions(ctx, data, guild_id, &raid_config).await?;

    Ok(())
}

async fn revert_actions(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
    raid_config: &RaidDetectionConfig,
) -> Result<(), Error> {
    for action in &raid_config.raid_actions {
        match action {
            RaidAction::LockdownServer => {
                let ctx = ctx.clone();
                let data = (*data).clone();
                task::spawn("raid_global_unlock", async move {
                    match apply_global_unlock(&ctx, &data, guild_id).await {
                        Ok(_) => audit::global_lockdown_lifted(guild_id),
                        Err(e) => {
                            error!(
                                error = ?e,
                                %guild_id,
                                "global server lockdown not lifted on raid end"
                            );
                        }
                    }
                });
            }
            RaidAction::PauseInvites { .. } => {
                let past_timestamp = Timestamp::from_unix_timestamp(0)?;
                let builder =
                    EditGuildIncidentActions::new().invites_disabled_until(past_timestamp);

                match guild_id
                    .edit_guild_incident_actions(&ctx.http, guild_id, builder)
                    .await
                {
                    Ok(_) => audit::invites_unpaused(guild_id),
                    Err(e) => {
                        error!(error = ?e, %guild_id, "server invites not unpaused on raid end");
                    }
                }
            }
            RaidAction::Alert { channel_id } => {
                let channel = ChannelId::new(*channel_id);
                let message = CreateMessage::new().content(
                    "**Raid Resolved**: Join rate has stabilized back to safe levels. Reverted incident actions and lockdown state."
                );
                match channel.send_message(&ctx.http, message).await {
                    Ok(_) => audit::resolved_alert_sent(guild_id, channel),
                    Err(e) => {
                        warn!(
                            error = ?e,
                            %guild_id,
                            channel_id = %channel,
                            "raid resolved alert not delivered; moderators were not notified"
                        );
                    }
                }
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
            spawn_raid_end_monitor(ctx.clone(), (*data).clone(), *guild_id);
            info!(%guild_id, "raid end monitor re-attached for an active raid");
        } else {
            info!(%guild_id, "stale raid tracking found");
            if let Err(e) = handle_raid_end(ctx, data, *guild_id).await {
                error!(%guild_id, error = ?e, "state restore during startup reconciliation failed");
            }
        }
    }

    // If Redis had no tracked guilds, check Postgres for active raids that survived a Redis flush
    if tracked_guilds.is_empty() {
        let db_guilds = database::get_all_active_raid_guilds(&data.core.db).await?;

        if !db_guilds.is_empty() {
            info!(
                count = db_guilds.len(),
                "redis empty; active raids found in the database"
            );
        }

        for guild_id in db_guilds {
            // Check if this guild's raid is still "active" by re-saving to Redis and attaching monitor
            info!(%guild_id, "active raid recovered from the database");

            // Re-populate Redis active raids set and snapshot
            let loaded = match database::load_active_raid_state(&data.core.db, guild_id).await {
                Ok(Some(snapshot)) => Some(snapshot),
                Ok(None) => {
                    warn!(%guild_id, "active raid in the database with no snapshot");
                    if let Err(e) = database::delete_active_raid_state(&data.core.db, guild_id).await
                    {
                        warn!(error = ?e, %guild_id, "orphaned raid state row not deleted");
                    }
                    None
                }
                Err(e) => {
                    // Skipping the delete, because a read failure is not evidence the row is
                    // orphaned. Deleting here loses a live raid's state, and nothing is left to
                    // lift the mitigations it applied.
                    error!(
                        error = ?e,
                        %guild_id,
                        "active raid state lookup failed during recovery; the raid was not resumed"
                    );
                    None
                }
            };
            if let Some(snapshot) = loaded {
                let snapshot_json = match serde_json::to_string(&snapshot) {
                    Ok(j) => j,
                    Err(e) => {
                        error!(
                            error = ?e,
                            %guild_id,
                            "pre-raid snapshot serialization for redis recovery failed"
                        );
                        continue;
                    }
                };

                if let Err(e) =
                    cache::save_preraid_snapshot(&data.core.redis, guild_id, &snapshot_json).await
                {
                    error!(
                        error = ?e,
                        %guild_id,
                        "pre-raid snapshot not saved to redis during recovery"
                    );
                }
                if let Err(e) = cache::add_guild_to_raid(guild_id, &data.core.redis).await {
                    warn!(
                        error = ?e,
                        %guild_id,
                        "guild not re-registered in the active raid set during recovery"
                    );
                }

                // Try to set raid active; if it fails (e.g. another instance already has it), skip
                match cache::try_set_raid_active(&data.core.redis, guild_id, 300).await {
                    Ok(true) => {
                        spawn_raid_end_monitor(ctx.clone(), (*data).clone(), guild_id);
                    }
                    Ok(false) => {
                        warn!(%guild_id, "raid already tracked by another instance; skipping");
                    }
                    Err(e) => {
                        error!(error = ?e, %guild_id, "raid active flag not set during recovery");
                    }
                }
            }
        }
    }

    Ok(())
}
