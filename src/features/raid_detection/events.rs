use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::moderation::apply_global_lock;
use crate::features::raid_detection::database;
use crate::features::raid_detection::implementation::{DynamicRaidDetector, clear_raid_active};
use crate::features::raid_detection::raid_end::spawn_raid_end_monitor;
use crate::features::raid_detection::snapshot::ensure_preraid_state_saved;
use crate::features::raid_detection::types::RaidAction;
use serenity::all::{
    ChannelId, Context, CreateMessage, EditGuildIncidentActions, EditMember, Member, Timestamp,
};
use tracing::{debug, error, info, instrument, trace, warn};

#[instrument(
    skip(ctx, data, new_member),
    fields(
        guild_id = new_member.guild_id.get(),
        user_id = new_member.user.id.get()
    )
)]
pub async fn handle_raid_detection(
    ctx: &Context,
    data: &BotData,
    new_member: &Member,
) -> Result<(), Error> {
    let guild_id = new_member.guild_id;
    let guild_id_u64 = guild_id.get();
    let user_id = new_member.user.id.get();
    let now = chrono::Utc::now();

    let Some(raid_config) = get_settings(
        &data.core.db, &data.core.redis, &data.core.guild_configs_cache, guild_id_u64 as i64,
    ).await?.raid_detection else {
        trace!(guild_id = guild_id_u64, "Raid detection is disabled or unconfigured");
        return Ok(());
    };

    let detector = DynamicRaidDetector::new(
        data.core.redis.clone(),
        raid_config.window_size_seconds,
        raid_config.z_score_multiplier,
        raid_config.min_safe_limit,
    );

    let result = detector.record_join(guild_id_u64, user_id, now).await?;

    if !result.is_anomaly {
        trace!(
            guild_id = guild_id_u64,
            user_id,
            window_seconds = raid_config.window_size_seconds,
            current_joins = result.current_joins_in_window,
            threshold = result.calculated_threshold,
            "Member join recorded within safety limits"
        );
        return Ok(());
    }

    info!(
        guild_id = guild_id_u64,
        user_id,
        current_joins = result.current_joins_in_window,
        threshold = result.calculated_threshold,
        avg_joins_per_min = result.avg_joins_per_min,
        std_dev_per_min = result.std_dev_per_min,
        "Raid anomaly detected! Executing mitigation actions"
    );

    let is_first_trigger = detector.try_set_raid_active(guild_id_u64, 300).await?;

    if is_first_trigger {
        info!(guild_id = guild_id_u64, "First raid trigger recorded; initializing server snapshot and monitors");

        if let Err(e) = ensure_preraid_state_saved(ctx, data, guild_id_u64).await {
            error!(
                error = %e,
                guild_id = guild_id_u64,
                "Failed to save pre-raid state snapshot; rolling back active raid flag"
            );
            // Rollback Redis active state so next join can retry
            let _ = clear_raid_active(&data.core.redis, guild_id_u64).await;
            return Err(e);
        }

        spawn_raid_end_monitor(ctx.clone(), (*data).clone(), guild_id_u64);

        for action in &raid_config.raid_actions {
            match action {
                RaidAction::LockdownServer => {
                    info!(guild_id = guild_id_u64, "Spawning global server lockdown background task");
                    let ctx = ctx.clone();
                    let data = (*data).clone();
                    let guild_id = guild_id;
                    tokio::spawn(async move {
                        if let Err(e) = apply_global_lock(&ctx, &data, guild_id).await {
                            error!(error = ?e, guild_id = guild_id.get(), "Failed to lock server in background task");
                        }
                    });
                }
                RaidAction::BumpVerification => {
                    info!(guild_id = guild_id_u64, "Bumping server verification requirement to hCaptcha");
                    database::bump_verification_to_max(&data.core.db, guild_id_u64 as i64).await?;
                }
                _ => {}
            }
        }
    } else {
        debug!(guild_id = guild_id_u64, "Raid active state already present; extending TTL");
        detector.extend_raid_active(guild_id_u64, 300).await?;
    }

    for action in &raid_config.raid_actions {
        match action {
            RaidAction::PauseInvites { hours } if is_first_trigger => {
                info!(guild_id = guild_id_u64, hours, "Pausing server invites");
                let until = chrono::Utc::now() + chrono::Duration::hours(*hours);
                let timestamp = Timestamp::from_unix_timestamp(until.timestamp())?;

                let builder = EditGuildIncidentActions::new().invites_disabled_until(timestamp);
                guild_id.edit_guild_incident_actions(&ctx.http, guild_id, builder).await?;
            }
            RaidAction::Alert { channel_id } if is_first_trigger => {
                info!(guild_id = guild_id_u64, channel_id, "Sending raid notification alert to channel");
                let channel = ChannelId::new(*channel_id);
                let message_content = format!(
                    "# Raid detected! Statistics\n\
                    - Current joins in the past minute: {}\n\
                    - Average joins per minute: {}\n\
                    - Standard deviation per minute: {}\n\
                    - Calculated threshold: {}\n\
                    Triggered by user `{}`.",
                    result.current_joins_in_window,
                    result.avg_joins_per_min,
                    result.std_dev_per_min,
                    result.calculated_threshold,
                    new_member.user.name
                );
                let message = CreateMessage::new().content(message_content);
                if let Err(e) = channel.send_message(&ctx.http, message).await {
                    error!(error = %e, channel_id, guild_id = guild_id_u64, "Failed to send raid alert message");
                }
            }

            RaidAction::AutoBanNewAccounts { max_age_hours } => {
                let created_at = new_member.user.id.created_at();
                let age = now.signed_duration_since(created_at.to_utc());

                if (age.num_hours() as u64) < *max_age_hours {
                    warn!(
                        guild_id = guild_id_u64,
                        user_id,
                        account_age_hours = age.num_hours(),
                        max_age_hours,
                        "Auto-banning account created too recently during active raid"
                    );
                    new_member
                        .ban_with_reason(ctx, 0, "Account joined during active raid and is too new.")
                        .await?;
                }
            }
            RaidAction::TimeoutNewJoins { mins } => {
                warn!(
                    guild_id = guild_id_u64,
                    user_id,
                    timeout_mins = mins,
                    "Applying communication timeout to new join during active raid"
                );
                let timeout_until = chrono::Utc::now() + chrono::Duration::minutes(i64::from(*mins));
                let timestamp = Timestamp::from_unix_timestamp(timeout_until.timestamp())?;
                let builder = EditMember::new().disable_communication_until_datetime(timestamp);

                guild_id.edit_member(&ctx.http, new_member.user.id, builder).await?;
            }

            _ => {} // Ignore global actions on non-first triggers
        }
    }

    Ok(())
}