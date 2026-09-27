//! Per-ticket audit trail. `reason` on a close separates a user closing their own ticket from the
//! inactivity worker closing an abandoned one. See `docs/logging.md`.

use serenity::all::{ChannelId, GuildId, UserId};
use tracing::info;

/// Records a ticket channel being created for a user.
pub fn ticket_opened(guild_id: GuildId, channel_id: ChannelId, user_id: UserId) {
    info!(
        event = "ticket_opened",
        %guild_id,
        %channel_id,
        %user_id,
        "tickets: opened a ticket"
    );
}

/// Records a ticket closing. `reason` is one of `user_closed`, `inactivity_closed` or
/// `abandoned_closed`; `closer_id` is `None` when a worker closed it.
pub fn ticket_closed(
    guild_id: GuildId,
    channel_id: ChannelId,
    closer_id: Option<UserId>,
    reason: &'static str,
) {
    info!(
        event = "ticket_closed",
        %guild_id,
        %channel_id,
        closer_id = ?closer_id,
        reason,
        "tickets: closed a ticket"
    );
}

/// Records the inactivity worker warning a ticket before closing it. The candidate query does not
/// select the ticket's owner, so the line has no `user_id`.
pub fn ticket_warned_inactive(guild_id: GuildId, channel_id: ChannelId) {
    info!(
        event = "ticket_warned_inactive",
        %guild_id,
        %channel_id,
        "tickets: warned a ticket of inactivity"
    );
}

/// Records a moderator wiring up the ticket system for a guild.
pub fn panel_configured(guild_id: GuildId, moderator_id: UserId, panel_channel_id: ChannelId) {
    info!(
        event = "panel_configured",
        %guild_id,
        %moderator_id,
        %panel_channel_id,
        "tickets: configured the ticket system"
    );
}
