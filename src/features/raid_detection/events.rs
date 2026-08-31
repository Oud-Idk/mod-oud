use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::moderation::apply_global_lock;
use crate::features::raid_detection::cache;
use crate::features::raid_detection::database;
use crate::features::raid_detection::implementation::DynamicRaidDetector;
use crate::features::raid_detection::raid_end::spawn_raid_end_monitor;
use crate::features::raid_detection::snapshot::ensure_preraid_state_saved;
use crate::features::raid_detection::types::{RaidAction, RaidEventType};
use chrono::{DateTime, Utc};
use serenity::all::{
    ChannelId, Context, CreateMessage, EditGuildIncidentActions, EditMember, GuildId, Member,
    Timestamp,
};
use tracing::{debug, error, info, instrument, trace, warn};

/// Detects raid anomalies on member join and applies configured mitigation actions.
///
/// # Errors
/// Returns an error if guild settings cannot be loaded, join metrics fail to record,
/// the pre-raid snapshot cannot be saved, or any mitigation action fails to execute.
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
    let user_id = new_member.user.id;
    let now = Utc::now();

    let Some(raid_config) = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?
    .raid_detection
    else {
        trace!(%guild_id, "Raid detection is disabled or unconfigured");
        return Ok(());
    };

    let is_already_active = cache::check_raid_active(&data.core.redis, guild_id)
        .await
        .unwrap_or(false);

    let detector = DynamicRaidDetector::new(
        data.core.redis.clone(),
        raid_config.window_size_seconds,
        raid_config.z_score_multiplier,
        raid_config.min_safe_limit,
    );

    let result = detector.record_join(guild_id, user_id, now).await?;

    let hour_str = now.format("%Y%m%d%H").to_string();
    if let Err(e) = cache::increment_hourly_accumulator(&data.core.redis, guild_id, &hour_str).await
    {
        warn!(error = ?e, %guild_id, "Failed to increment hourly stats accumulator");
    }

    // Spike detected (Starts raid OR spikes during ongoing raid)
    if result.is_anomaly {
        info!(
            %guild_id,
            %user_id,
            current_joins = result.current_joins_in_window,
            threshold = result.calculated_threshold,
            avg_joins_per_min = result.avg_joins_per_min,
            std_dev_per_min = result.std_dev_per_min,
            "Raid anomaly detected! Executing mitigation actions"
        );

        let alert_message = format!(
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

        // Manage raid lifecycle (snapshots, monitor, guild-wide mitigations)
        let is_first_trigger = detector.try_set_raid_active(guild_id, 300).await?;
        handle_raid_lifecycle(
            ctx,
            data,
            &detector,
            guild_id,
            &raid_config.raid_actions,
            is_first_trigger,
            &alert_message,
        )
        .await?;

        // Apply member-specific mitigations (timeouts, auto-bans)
        apply_member_mitigations(ctx, new_member, &raid_config.raid_actions, now).await?;
        return Ok(());
    }

    // Raid is active, even if this single join isn't a spike
    if is_already_active {
        debug!(
            %guild_id,
            %user_id,
            "Join occurred during active raid session. Applying member mitigations."
        );

        // Keep the raid cooldown timer alive
        let _ = detector.extend_raid_active(guild_id, 300).await;

        // Apply member-specific mitigations to this joiner as well!
        apply_member_mitigations(ctx, new_member, &raid_config.raid_actions, now).await?;
        return Ok(());
    }

    trace!(
        %guild_id,
        %user_id,
        window_seconds = raid_config.window_size_seconds,
        current_joins = result.current_joins_in_window,
        threshold = result.calculated_threshold,
        "Member join recorded within safety limits"
    );

    Ok(())
}

/// Handles raid state initialization/extension and guild-wide mitigation triggers.
async fn handle_raid_lifecycle(
    ctx: &Context,
    data: &BotData,
    detector: &DynamicRaidDetector,
    guild_id: GuildId,
    actions: &[RaidAction],
    is_first_trigger: bool,
    alert_message: &str,
) -> Result<(), Error> {
    if !is_first_trigger {
        debug!(%guild_id, "Raid active state already present; extending TTL");
        detector.extend_raid_active(guild_id, 300).await?;
        return Ok(());
    }

    info!(%guild_id, "First raid trigger recorded; initializing server snapshot and monitors");

    if let Err(e) = ensure_preraid_state_saved(ctx, data, guild_id).await {
        error!(
            error = %e,
            %guild_id,
            "Failed to save pre-raid state snapshot; rolling back active raid flag"
        );
        let _ = cache::clear_raid_active(&data.core.redis, guild_id).await;
        return Err(e);
    }

    // Log the raid trigger event
    if let Err(e) = database::log_raid_event(
        &data.core.db,
        guild_id,
        RaidEventType::Triggered,
        Some(serde_json::json!({
            "message": alert_message,
        })),
    )
    .await
    {
        error!(error = ?e, %guild_id, "Failed to log raid trigger event");
    }

    spawn_raid_end_monitor(ctx.clone(), (*data).clone(), guild_id);

    apply_guild_mitigations(ctx, data, guild_id, actions, alert_message).await?;

    Ok(())
}

/// Applies one-time guild-wide mitigation actions (Lockdown, Verification, Invites, Alerts).
async fn apply_guild_mitigations(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
    actions: &[RaidAction],
    alert_message: &str,
) -> Result<(), Error> {
    for action in actions {
        match action {
            RaidAction::LockdownServer => {
                info!(%guild_id, "Spawning global server lockdown background task");
                let ctx = ctx.clone();
                let data = (*data).clone();
                tokio::spawn(async move {
                    if let Err(e) = apply_global_lock(&ctx, &data, guild_id).await {
                        error!(error = ?e, %guild_id, "Failed to lock server in background task");
                    }
                });
            }
            RaidAction::BumpVerification => {
                info!(%guild_id, "Bumping server verification requirement to hCaptcha");
                database::bump_verification_to_max(&data.core.db, guild_id).await?;
            }
            RaidAction::PauseInvites { hours } => {
                info!(%guild_id, hours, "Pausing server invites");
                let until = Utc::now() + chrono::Duration::hours(*hours);
                let timestamp = Timestamp::from_unix_timestamp(until.timestamp())?;
                let builder = EditGuildIncidentActions::new().invites_disabled_until(timestamp);

                guild_id
                    .edit_guild_incident_actions(&ctx.http, guild_id, builder)
                    .await?;
            }
            RaidAction::Alert { channel_id } => {
                info!(%guild_id, channel_id, "Sending raid notification alert to channel");
                let channel = ChannelId::new(*channel_id);
                let message = CreateMessage::new().content(alert_message);

                if let Err(e) = channel.send_message(&ctx.http, message).await {
                    error!(error = %e, channel_id, %guild_id, "Failed to send raid alert message");
                }
            }
            _ => {}
        }
    }
    Ok(())
}

/// Applies per-member mitigation actions (Timeouts, Auto-bans).
async fn apply_member_mitigations(
    ctx: &Context,
    member: &Member,
    actions: &[RaidAction],
    now: DateTime<Utc>,
) -> Result<(), Error> {
    let guild_id = member.guild_id;
    let user_id = member.user.id;

    for action in actions {
        match action {
            RaidAction::AutoBanNewAccounts { max_age_hours } => {
                let created_at = user_id.created_at().to_utc();
                let age = now.signed_duration_since(created_at);

                if age.num_hours() < i64::try_from(*max_age_hours).unwrap_or(i64::MAX) {
                    warn!(
                        %guild_id,
                        %user_id,
                        account_age_hours = age.num_hours(),
                        max_age_hours,
                        "Auto-banning account created too recently during active raid"
                    );
                    member
                        .ban_with_reason(
                            ctx,
                            0,
                            "Account joined during active raid and is too new.",
                        )
                        .await?;
                }
            }
            RaidAction::TimeoutNewJoins { mins } => {
                warn!(
                    %guild_id,
                    %user_id,
                    timeout_mins = mins,
                    "Applying communication timeout to new join during active raid"
                );
                let timeout_until = Utc::now() + chrono::Duration::minutes(i64::from(*mins));
                let timestamp = Timestamp::from_unix_timestamp(timeout_until.timestamp())?;
                let builder = EditMember::new().disable_communication_until_datetime(timestamp);

                guild_id.edit_member(&ctx.http, user_id, builder).await?;
            }
            _ => {}
        }
    }

    Ok(())
}
