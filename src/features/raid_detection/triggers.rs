use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::moderation::apply_global_lock;
use crate::features::raid_detection::database;
use crate::features::raid_detection::implementation::DynamicRaidDetector;
use crate::features::raid_detection::raid_end::handle_raid_end;
use crate::features::raid_detection::raid_end::spawn_raid_end_monitor;
use crate::features::raid_detection::snapshot::ensure_preraid_state_saved;
use crate::features::raid_detection::types::{RaidAction, RaidEventType};
use crate::features::raid_detection::{RaidDetectionConfig, cache};
use serenity::all::{
    ChannelId, Context, CreateMessage, EditGuildIncidentActions, GuildId, Timestamp,
};
use tracing::{error, info, instrument, warn};

#[instrument(
    skip(ctx, data),
    fields(
        %guild_id,
        mod_username = mod_username
    )
)]
pub async fn trigger_raid_manual(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
    mod_username: &str,
) -> Result<bool, Error> {
    info!(
        %guild_id,
        mod_username,
        "Manual raid mode activation requested by moderator"
    );

    let detector = DynamicRaidDetector::new(data.core.redis.clone(), 60, 3.0, 5);

    let is_first_trigger = detector.try_set_raid_active(guild_id, 300).await?;
    if !is_first_trigger {
        warn!(
            %guild_id,
            mod_username,
            "Manual raid trigger ignored: server is already in an active raid"
        );
        return Ok(false);
    }

    if let Err(e) = ensure_preraid_state_saved(ctx, data, guild_id).await {
        error!(
            error = %e,
            %guild_id,
            mod_username,
            "Failed to save pre-raid state snapshot during manual raid trigger; rolling back active state"
        );
        let _ = cache::clear_raid_active(&data.core.redis, guild_id).await;
        return Err(e);
    }

    if let Err(e) = database::log_raid_event(
        &data.core.db,
        guild_id,
        RaidEventType::Triggered,
        Some(serde_json::json!({
            "moderator": mod_username,
            "manual": true,
        })),
    )
    .await
    {
        error!(error = ?e, %guild_id, "Failed to log manual raid trigger event");
    }

    spawn_raid_end_monitor(ctx.clone(), (*data).clone(), guild_id);

    let Some(raid_config) = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?
    .raid_detection
    else {
        warn!(
            %guild_id,
            "Raid mode set active manually, but no raid configuration found for mitigation actions"
        );
        return Ok(true);
    };

    invoke_actions(&ctx, &data, guild_id, mod_username, &raid_config).await?;

    info!(
        %guild_id,
        mod_username,
        "Manual raid mode successfully activated"
    );

    Ok(true)
}

async fn invoke_actions(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
    mod_username: &str,
    raid_config: &Box<RaidDetectionConfig>,
) -> Result<(), Error> {
    for action in &raid_config.raid_actions {
        match action {
            RaidAction::LockdownServer => {
                info!(%guild_id, "Spawning global server lockdown background task (manual trigger)");
                let ctx = ctx.clone();
                let data = (*data).clone();
                tokio::spawn(async move {
                    if let Err(e) = apply_global_lock(&ctx, &data, guild_id).await {
                        error!(error = ?e, %guild_id, "Failed to lock server during manual trigger");
                    }
                });
            }
            RaidAction::BumpVerification => {
                info!(%guild_id, "Bumping server verification to hCaptcha and using auth (manual trigger)");
                database::bump_verification_to_max(&data.core.db, guild_id).await?;
            }
            RaidAction::PauseInvites { hours } => {
                info!(%guild_id, hours, "Pausing server invites (manual trigger)");
                let until = chrono::Utc::now() + chrono::Duration::hours(*hours);
                let timestamp = Timestamp::from_unix_timestamp(until.timestamp())?;
                let builder = EditGuildIncidentActions::new().invites_disabled_until(timestamp);
                guild_id
                    .edit_guild_incident_actions(&ctx.http, guild_id, builder)
                    .await?;
            }
            RaidAction::Alert { channel_id } => {
                info!(%guild_id, channel_id, "Sending manual raid alert message");
                let channel = ChannelId::new(*channel_id);
                let message_content = format!(
                    "**Manual Raid Mode Activated** by moderator `{mod_username}`! Server incident protections have been enabled."
                );
                let message = CreateMessage::new().content(message_content);
                if let Err(e) = channel.send_message(&ctx.http, message).await {
                    error!(error = %e, channel_id, %guild_id, "Failed to send manual raid alert message");
                }
            }
            _ => {}
        }
    }
    Ok(())
}

#[instrument(skip(ctx, data), fields(%guild_id))]
pub async fn resolve_raid_manual(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
) -> Result<bool, Error> {
    info!(%guild_id, "Manual raid resolution requested");

    let is_active = cache::check_raid_active(&data.core.redis, guild_id)
        .await
        .unwrap_or(false);
    let has_snapshot = cache::has_raid_snapshot(&data.core.redis, guild_id)
        .await
        .unwrap_or(false);

    if !is_active && !has_snapshot {
        warn!(
            %guild_id,
            "Manual raid resolution ignored: no active raid flag or snapshot found"
        );
        return Ok(false);
    }

    cache::clear_raid_active(&data.core.redis, guild_id).await?;

    // Log the resolve event
    if let Err(e) =
        database::log_raid_event(&data.core.db, guild_id, RaidEventType::Resolved, None).await
    {
        error!(error = ?e, %guild_id, "Failed to log raid resolve event");
    }

    info!(%guild_id, "Cleared active raid flag; initiating raid cleanup");
    handle_raid_end(ctx, data, guild_id).await?;

    info!(%guild_id, "Manual raid resolution completed successfully");

    Ok(true)
}
