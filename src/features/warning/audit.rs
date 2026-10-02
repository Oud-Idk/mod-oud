//! Per-action audit trail for warnings and the threshold actions they trigger. Mirrors the
//! `warn_action` and threshold automod rows at `info!` with an `event` field, so one filter covers
//! the feature. See `docs/logging.md`.
//!
//! The threshold functions all take `warn_count`, which the log lines they replace did not carry.
//! Without it an auto-ban is visible but not attributable: nothing says which threshold fired.

use serenity::all::{GuildId, RoleId, UserId};
use tracing::info;

/// Records a warning being issued against a member.
pub fn warning_issued(
    guild_id: GuildId,
    target_id: UserId,
    moderator_id: UserId,
    warning_id: i64,
    warn_count: i32,
) {
    info!(
        event = "warning_issued",
        %guild_id,
        %target_id,
        %moderator_id,
        warning_id,
        warn_count,
        "warning: issued a warning"
    );
}

/// Records a warning being activated or deactivated, which is what a pardon does.
pub fn warning_status_changed(
    guild_id: GuildId,
    target_id: UserId,
    moderator_id: UserId,
    warning_id: i64,
    active: bool,
) {
    info!(
        event = "warning_status_changed",
        %guild_id,
        %target_id,
        %moderator_id,
        warning_id,
        active,
        "warning: changed a warning's active status"
    );
}

/// Records a warning record being deleted outright.
pub fn warning_deleted(
    guild_id: GuildId,
    target_id: UserId,
    moderator_id: UserId,
    warning_id: i64,
) {
    info!(
        event = "warning_deleted",
        %guild_id,
        %target_id,
        %moderator_id,
        warning_id,
        "warning: deleted a warning record"
    );
}

/// Records a threshold ban. `moderator_id` is the bot, because reaching the threshold is what
/// asked for it rather than a person.
pub fn auto_ban_applied(guild_id: GuildId, target_id: UserId, warn_count: i32) {
    info!(
        event = "auto_ban_applied",
        %guild_id,
        %target_id,
        actor = "bot",
        warn_count,
        "warning: banned a member at the warning threshold"
    );
}

/// Records a threshold kick.
pub fn auto_kick_applied(guild_id: GuildId, target_id: UserId, warn_count: i32) {
    info!(
        event = "auto_kick_applied",
        %guild_id,
        %target_id,
        actor = "bot",
        warn_count,
        "warning: kicked a member at the warning threshold"
    );
}

/// Records a threshold timeout. A mute is a `Duration` on the member, not a channel restriction.
pub fn auto_timeout_applied(
    guild_id: GuildId,
    target_id: UserId,
    warn_count: i32,
    duration_secs: i32,
) {
    info!(
        event = "auto_timeout_applied",
        %guild_id,
        %target_id,
        actor = "bot",
        warn_count,
        duration_secs,
        "warning: timed out a member at the warning threshold"
    );
}

/// Records a role the threshold added.
pub fn threshold_role_added(
    guild_id: GuildId,
    target_id: UserId,
    role_id: RoleId,
    warn_count: i32,
) {
    info!(
        event = "threshold_role_added",
        %guild_id,
        %target_id,
        %role_id,
        actor = "bot",
        warn_count,
        "warning: added a role at the warning threshold"
    );
}

/// Records a role the threshold removed.
pub fn threshold_role_removed(
    guild_id: GuildId,
    target_id: UserId,
    role_id: RoleId,
    warn_count: i32,
) {
    info!(
        event = "threshold_role_removed",
        %guild_id,
        %target_id,
        %role_id,
        actor = "bot",
        warn_count,
        "warning: removed a role at the warning threshold"
    );
}

/// Records the threshold stripping every role from a member, which is the action that most
/// deserves a line and had only a bare `debug!`.
pub fn all_roles_removed(guild_id: GuildId, target_id: UserId, warn_count: i32, removed: usize) {
    info!(
        event = "all_roles_removed",
        %guild_id,
        %target_id,
        actor = "bot",
        warn_count,
        removed_count = removed,
        "warning: removed every role at the warning threshold"
    );
}
