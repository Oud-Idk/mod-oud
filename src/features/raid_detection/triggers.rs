use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::moderation::apply_global_lock;
use crate::features::raid_detection::audit;
use crate::features::raid_detection::database;
use crate::features::raid_detection::implementation::DynamicRaidDetector;
use crate::features::raid_detection::raid_end::handle_raid_end;
use crate::features::raid_detection::raid_end::spawn_raid_end_monitor;
use crate::features::raid_detection::snapshot::ensure_preraid_state_saved;
use crate::features::raid_detection::types::{RaidAction, RaidEventType};
use crate::features::raid_detection::{RaidDetectionConfig, cache};
use crate::shared::task;
use serenity::all::{
    ChannelId, Context, CreateMessage, EditGuildIncidentActions, GuildId, Timestamp,
};
use tracing::{error, instrument, warn};

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
    let detector = DynamicRaidDetector::new(data.core.redis.clone(), 60, 3.0, 5);

    let is_first_trigger = detector.try_set_raid_active(guild_id, 300).await?;
    if !is_first_trigger {
        warn!(
            %guild_id,
            mod_username,
            "manual raid trigger ignored: server is already in an active raid"
        );
        return Ok(false);
    }

    if let Err(e) = ensure_preraid_state_saved(ctx, data, guild_id).await {
        error!(
            error = %e,
            %guild_id,
            mod_username,
            "pre-raid state snapshot save failed; rolling back active state"
        );
        if let Err(clear_err) = cache::clear_raid_active(&data.core.redis, guild_id).await {
            error!(
                error = ?clear_err,
                %guild_id,
                "raid active flag not cleared during rollback; raid mode may stay active"
            );
        }
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
        error!(error = ?e, %guild_id, "manual raid trigger event log write failed");
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
        error!(
            fault = "raid detection is not configured for this guild",
            %guild_id,
            "raid mode set active manually, but no raid configuration found for mitigation actions"
        );
        return Ok(true);
    };

    invoke_actions(ctx, data, guild_id, mod_username, &raid_config).await?;

    audit::manual_raid_activated(guild_id, mod_username);

    Ok(true)
}

async fn invoke_actions(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
    mod_username: &str,
    raid_config: &RaidDetectionConfig,
) -> Result<(), Error> {
    for action in &raid_config.raid_actions {
        match action {
            RaidAction::LockdownServer => {
                let ctx = ctx.clone();
                let data = (*data).clone();
                // mod_username is captured by the closure so the success line can name who asked.
                let moderator = mod_username.to_string();
                task::spawn("raid_manual_lock", async move {
                    match apply_global_lock(&ctx, &data, guild_id).await {
                        Ok(_) => audit::global_lockdown_applied(guild_id, Some(&moderator)),
                        Err(e) => {
                            error!(
                                error = ?e,
                                %guild_id,
                                "global server lockdown not applied for a manual trigger"
                            );
                        }
                    }
                });
            }
            RaidAction::BumpVerification => {
                database::bump_verification_to_max(&data.core.db, guild_id).await?;
                audit::verification_bumped(guild_id, Some(mod_username));
            }
            RaidAction::PauseInvites { hours } => {
                let until = chrono::Utc::now() + chrono::Duration::hours(*hours);
                let timestamp = Timestamp::from_unix_timestamp(until.timestamp())?;
                let builder = EditGuildIncidentActions::new().invites_disabled_until(timestamp);
                guild_id
                    .edit_guild_incident_actions(&ctx.http, guild_id, builder)
                    .await?;

                audit::invites_paused(guild_id, Some(mod_username), *hours);
            }
            RaidAction::Alert { channel_id } => {
                let channel = ChannelId::new(*channel_id);
                let message_content = format!(
                    "**Manual Raid Mode Activated** by moderator `{mod_username}`! Server incident protections have been enabled."
                );
                let message = CreateMessage::new().content(message_content);
                if let Err(e) = channel.send_message(&ctx.http, message).await {
                    warn!(
                        error = %e,
                        channel_id,
                        %guild_id,
                        "manual raid alert message delivery failed"
                    );
                } else {
                    audit::alert_sent(guild_id, Some(mod_username), channel);
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
    mod_username: &str,
) -> Result<bool, Error> {
    let is_active = cache::check_raid_active(&data.core.redis, guild_id)
        .await
        .unwrap_or(false);
    let has_snapshot = cache::has_raid_snapshot(&data.core.redis, guild_id)
        .await
        .unwrap_or(false);

    if !is_active && !has_snapshot {
        warn!(
            %guild_id,
            "manual raid resolution ignored: no active raid flag or snapshot found"
        );
        return Ok(false);
    }

    cache::clear_raid_active(&data.core.redis, guild_id).await?;

    // Log the resolve event
    if let Err(e) =
        database::log_raid_event(&data.core.db, guild_id, RaidEventType::Resolved, None).await
    {
        error!(error = ?e, %guild_id, "raid resolve event log write failed");
    }

    handle_raid_end(ctx, data, guild_id).await?;

    audit::manual_raid_resolved(guild_id, mod_username);

    Ok(true)
}
