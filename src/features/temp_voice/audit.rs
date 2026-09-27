//! Per-transfer audit trail for temporary voice channels. Creation and teardown are not here:
//! both fire per voice event and belong at `debug!`. See `docs/logging.md`.

use serenity::all::{ChannelId, GuildId, UserId};
use tracing::info;

/// Records an offer being sent to a target user. The transfer is not complete yet.
pub fn transfer_offered(
    guild_id: GuildId,
    channel_id: ChannelId,
    from_owner: UserId,
    to_owner: UserId,
) {
    info!(
        event = "transfer_offered",
        %guild_id,
        %channel_id,
        from_owner = %from_owner,
        to_owner = %to_owner,
        "temp_voice: offered a channel transfer"
    );
}

/// Records the target accepting, which is the point ownership actually changes.
pub fn transfer_accepted(
    guild_id: GuildId,
    channel_id: ChannelId,
    from_owner: UserId,
    to_owner: UserId,
) {
    info!(
        event = "transfer_accepted",
        %guild_id,
        %channel_id,
        from_owner = %from_owner,
        to_owner = %to_owner,
        "temp_voice: transferred the channel"
    );
}

/// Records the target declining. The channel stays with its current owner, so `target` is who the
/// offer went to rather than who held the channel.
pub fn transfer_declined(guild_id: GuildId, channel_id: ChannelId, target: UserId) {
    info!(
        event = "transfer_declined",
        %guild_id,
        %channel_id,
        target = %target,
        "temp_voice: a channel transfer was declined"
    );
}
