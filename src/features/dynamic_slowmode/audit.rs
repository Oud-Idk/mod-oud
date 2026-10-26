//! Audit trail for dynamic slowmode. One typed function per event, `event = "..."` at `info!`, so
//! one filter covers the feature. See `docs/logging.md`.

use serenity::all::{ChannelId, GuildId};
use tracing::info;

/// Records a slowmode change the bot made.
pub fn slowmode_changed(guild_id: GuildId, channel_id: ChannelId, from: u16, to: u16) {
    info!(
        event = "slowmode_changed",
        %guild_id,
        %channel_id,
        from,
        to,
        "dynamic_slowmode: adjusted channel slowmode"
    );
}

/// Records a channel that is hot and already at the highest rung the policy allows.
pub fn ceiling_reached(guild_id: GuildId, channel_id: ChannelId, secs: u16) {
    info!(
        event = "slowmode_ceiling_reached",
        %guild_id,
        %channel_id,
        secs,
        "dynamic_slowmode: channel pinned at the ceiling"
    );
}

/// Records a channel that stopped being automated, and why.
pub fn disarmed(guild_id: GuildId, channel_id: ChannelId, reason: &str) {
    info!(
        event = "slowmode_disarmed",
        %guild_id,
        %channel_id,
        reason,
        "dynamic_slowmode: stopped automating channel"
    );
}

/// Records a channel that an admin asked the bot to automate again.
pub fn rearmed(guild_id: GuildId, channel_id: ChannelId) {
    info!(
        event = "slowmode_rearmed",
        %guild_id,
        %channel_id,
        "dynamic_slowmode: resumed automating channel"
    );
}

/// Records a channel that entered automation, with the value it was found at.
pub fn armed(guild_id: GuildId, channel_id: ChannelId, pre_automation_secs: u16) {
    info!(
        event = "slowmode_armed",
        %guild_id,
        %channel_id,
        pre_automation_secs,
        "dynamic_slowmode: started automating channel"
    );
}

/// Records a slowmode value restored to what it was before automation.
pub fn restored(guild_id: GuildId, channel_id: ChannelId, secs: u16) {
    info!(
        event = "slowmode_restored",
        %guild_id,
        %channel_id,
        secs,
        "dynamic_slowmode: restored pre-automation slowmode"
    );
}
