use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::moderation::apply_global_unlock;
use crate::features::raid_detection::snapshot::restore_preraid_state;
use crate::features::raid_detection::types::RaidAction;
use crate::features::raid_detection::keys;
use fred::interfaces::{KeysInterface, SetsInterface};
use serenity::all::{ChannelId, Context, CreateMessage, EditGuildIncidentActions, GuildId, Timestamp};
use tracing::{error, info};
use crate::features::raid_detection::keys::active_raids_key;

pub fn spawn_raid_end_monitor(ctx: Context, data: BotData, guild_id: GuildId) {
    tokio::spawn(async move {
        let active_key = keys::raid_active_key(guild_id);

        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

            let is_active: bool = match data.core.redis.exists(&active_key).await {
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

pub async fn handle_raid_end(ctx: &Context, data: &BotData, guild_id: GuildId) -> Result<(), Error> {
    let restored = restore_preraid_state(ctx, data, guild_id).await
        .inspect_err(|e| error!(error = ?e, "Failed to restore pre-raid state for guild {guild_id}"))
        .unwrap_or(false);

    if !restored {
        return Ok(());
    }

    let Some(raid_config) = get_settings(
        &data.core.db, &data.core.redis, &data.core.guild_configs_cache, guild_id,
    ).await?.raid_detection else {
        return Ok(());
    };

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
                let builder = EditGuildIncidentActions::new().invites_disabled_until(past_timestamp);

                if let Err(e) = guild_id.edit_guild_incident_actions(&ctx.http, guild_id, builder).await {
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
pub async fn reconcile_active_raids(ctx: &Context, data: &BotData) -> Result<(), Error> {
    let tracked_guilds: Vec<GuildId> = data
        .core
        .redis
        .smembers::<Vec<u64>, _>(active_raids_key())
        .await?
        .into_iter()
        .map(GuildId::new)
        .collect();

    for guild_id in tracked_guilds {
        let active_key = keys::raid_active_key(guild_id);
        let is_active: bool = data.core.redis.exists(&active_key).await.unwrap_or(false);

        if is_active {
            info!("Re-attaching raid monitor for active raid in guild {guild_id}");
            spawn_raid_end_monitor(ctx.clone(), (*data).clone(), guild_id);
        } else {
            info!("Found stale raid tracking for guild {guild_id}. Reverting state...");
            if let Err(e) = handle_raid_end(ctx, data, guild_id).await {
                error!(
                    error = ?e,
                    "Failed to restore state during startup reconciliation for guild {guild_id}"
                );
            }
        }
    }

    Ok(())
}