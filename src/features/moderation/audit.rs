//! Per-action audit trail for moderation. Mirrors `log_moderation_action`'s database row at
//! `info!` with an `event` field, so one filter covers the feature. See `docs/logging.md`.

use serenity::all::{ChannelId, GuildId, UserId};
use std::time::Duration;
use tracing::info;

/// Records a kick.
pub fn member_kicked(guild_id: GuildId, target_id: UserId, moderator_id: UserId, reason: &str) {
    info!(
        event = "member_kicked",
        %guild_id,
        %target_id,
        %moderator_id,
        reason,
        "moderation: kicked member"
    );
}

/// Records a ban. `duration` is `None` for a permanent ban.
pub fn member_banned(
    guild_id: GuildId,
    target_id: UserId,
    moderator_id: UserId,
    reason: &str,
    duration: Option<Duration>,
) {
    info!(
        event = "member_banned",
        %guild_id,
        %target_id,
        %moderator_id,
        reason,
        permanent = duration.is_none(),
        duration_secs = duration.map_or(0, |d| d.as_secs()),
        "moderation: banned member"
    );
}

/// Records a timeout. A mute is a `Duration` on the member, not a channel restriction.
pub fn member_muted(
    guild_id: GuildId,
    target_id: UserId,
    moderator_id: UserId,
    reason: &str,
    duration: Duration,
) {
    info!(
        event = "member_muted",
        %guild_id,
        %target_id,
        %moderator_id,
        reason,
        duration_secs = duration.as_secs(),
        "moderation: muted member"
    );
}

/// Records a timeout being lifted. `moderator_id` is the bot when a mute expired on its own.
pub fn member_unmuted(guild_id: GuildId, target_id: UserId, moderator_id: UserId) {
    info!(
        event = "member_unmuted",
        %guild_id,
        %target_id,
        %moderator_id,
        "moderation: unmuted member"
    );
}

/// Records an unban. The one moderation action the command handler logged itself, because unban
/// has no `issue_*` wrapper to sit in.
pub fn member_unbanned(guild_id: GuildId, target_id: UserId, moderator_id: UserId, reason: &str) {
    info!(
        event = "member_unbanned",
        %guild_id,
        %target_id,
        %moderator_id,
        reason,
        "moderation: unbanned member"
    );
}

/// Records a softban, which bans and immediately unbans to clear the member's recent messages.
pub fn member_softbanned(guild_id: GuildId, target_id: UserId, moderator_id: UserId, reason: &str) {
    info!(
        event = "member_softbanned",
        %guild_id,
        %target_id,
        %moderator_id,
        reason,
        "moderation: softbanned member"
    );
}

/// Records a temporary ban expiring. A worker did this, so the line carries `actor`, not a
/// moderator.
pub fn temp_ban_expired(guild_id: GuildId, target_id: UserId, ban_id: i64) {
    info!(
        event = "temp_ban_expired",
        %guild_id,
        %target_id,
        actor = "worker",
        ban_id,
        "moderation: temporary ban expired and was lifted"
    );
}

/// Records a bulk delete.
pub fn messages_purged(
    guild_id: GuildId,
    channel_id: ChannelId,
    moderator_id: UserId,
    deleted_count: usize,
) {
    info!(
        event = "messages_purged",
        %guild_id,
        %channel_id,
        %moderator_id,
        deleted_count,
        "moderation: bulk deleted messages"
    );
}

/// Records a single channel being locked.
pub fn channel_locked(guild_id: GuildId, channel_id: ChannelId, moderator_id: UserId) {
    info!(
        event = "channel_locked",
        %guild_id,
        %channel_id,
        %moderator_id,
        "moderation: locked channel"
    );
}

/// Records a single channel being unlocked.
pub fn channel_unlocked(guild_id: GuildId, channel_id: ChannelId, moderator_id: UserId) {
    info!(
        event = "channel_unlocked",
        %guild_id,
        %channel_id,
        %moderator_id,
        "moderation: unlocked channel"
    );
}

/// Records a server-wide lockdown. `failed` counts channels Discord refused, which is the number
/// that matters when a lockdown looks incomplete.
pub fn guild_locked(guild_id: GuildId, moderator_id: UserId, locked: usize, failed: usize) {
    info!(
        event = "guild_locked",
        %guild_id,
        %moderator_id,
        locked_count = locked,
        failed_count = failed,
        "moderation: locked down the guild"
    );
}

/// Records a server-wide unlock lifting.
pub fn guild_unlocked(guild_id: GuildId, moderator_id: UserId, unlocked: usize, failed: usize) {
    info!(
        event = "guild_unlocked",
        %guild_id,
        %moderator_id,
        unlocked_count = unlocked,
        failed_count = failed,
        "moderation: lifted the guild lockdown"
    );
}
