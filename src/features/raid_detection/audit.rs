//! Per-action audit trail for raid detection: the mitigations applied to a guild and the two
//! moderator-driven triggers. Mirrors the raid rows at `info!` with an `event` field, so one filter
//! covers the feature. See `docs/logging.md`.
//!
//! Each mitigation is reached from both `events.rs`, where the anomaly detector invoked it, and
//! `triggers.rs`, where a moderator did, so `moderator` is optional: `None` is the automatic path.

use serenity::all::{ChannelId, GuildId, UserId};
use tracing::info;

/// Records the join-rate anomaly that set the raid off, and what the detector measured.
#[allow(clippy::too_many_arguments)]
pub fn anomaly_detected(
    guild_id: GuildId,
    user_id: UserId,
    current_joins: i64,
    threshold: i64,
    avg_joins_per_min: f64,
    std_dev_per_min: f64,
) {
    info!(
        event = "anomaly_detected",
        %guild_id,
        %user_id,
        current_joins,
        threshold,
        avg_joins_per_min,
        std_dev_per_min,
        "raid: join rate crossed the detection threshold"
    );
}

/// Records the verification requirement being raised to hCaptcha.
pub fn verification_bumped(guild_id: GuildId, moderator: Option<&str>) {
    info!(
        event = "verification_bumped",
        %guild_id,
        moderator = ?moderator,
        "raid: raised the verification requirement to hCaptcha"
    );
}

/// Records server invites being paused as a mitigation.
pub fn invites_paused(guild_id: GuildId, moderator: Option<&str>, hours: i64) {
    info!(
        event = "invites_paused",
        %guild_id,
        moderator = ?moderator,
        hours,
        "raid: paused server invites"
    );
}

/// Records server invites being unpaused when the raid ended. The automatic path has no moderator.
pub fn invites_unpaused(guild_id: GuildId) {
    info!(
        event = "invites_unpaused",
        %guild_id,
        "raid: unpaused server invites"
    );
}

/// Records the raid alert reaching the configured channel.
pub fn alert_sent(guild_id: GuildId, moderator: Option<&str>, channel_id: ChannelId) {
    info!(
        event = "alert_sent",
        %guild_id,
        moderator = ?moderator,
        %channel_id,
        "raid: sent the raid alert to the configured channel"
    );
}

/// Records the raid-resolved alert reaching its channel. Previously only its failure was logged,
/// so a delivered resolution left no trace.
pub fn resolved_alert_sent(guild_id: GuildId, channel_id: ChannelId) {
    info!(
        event = "resolved_alert_sent",
        %guild_id,
        %channel_id,
        "raid: sent the raid-resolved alert"
    );
}

/// Records the global lockdown being applied. The work is spawned, so the success had no line of
/// its own and only the failure was visible.
pub fn global_lockdown_applied(guild_id: GuildId, moderator: Option<&str>) {
    info!(
        event = "global_lockdown_applied",
        %guild_id,
        moderator = ?moderator,
        "raid: applied the global server lockdown"
    );
}

/// Records the global lockdown being lifted on raid end.
pub fn global_lockdown_lifted(guild_id: GuildId) {
    info!(
        event = "global_lockdown_lifted",
        %guild_id,
        "raid: lifted the global server lockdown"
    );
}

/// Records an account too new to be trusted being banned during an active raid.
pub fn auto_ban_applied(
    guild_id: GuildId,
    user_id: UserId,
    account_age_hours: i64,
    max_age_hours: u64,
) {
    info!(
        event = "auto_ban_applied",
        %guild_id,
        %user_id,
        account_age_hours,
        max_age_hours,
        "raid: banned a new account joining an active raid"
    );
}

/// Records a new join being timed out during an active raid.
pub fn auto_timeout_applied(guild_id: GuildId, user_id: UserId, timeout_mins: u32) {
    info!(
        event = "auto_timeout_applied",
        %guild_id,
        %user_id,
        timeout_mins,
        "raid: timed out a new join during an active raid"
    );
}

/// Records a moderator turning raid mode on by hand.
pub fn manual_raid_activated(guild_id: GuildId, moderator: &str) {
    info!(
        event = "manual_raid_activated",
        %guild_id,
        moderator,
        "raid: a moderator activated raid mode"
    );
}

/// Records a moderator resolving raid mode by hand.
pub fn manual_raid_resolved(guild_id: GuildId, moderator: &str) {
    info!(
        event = "manual_raid_resolved",
        %guild_id,
        moderator,
        "raid: a moderator resolved raid mode"
    );
}
