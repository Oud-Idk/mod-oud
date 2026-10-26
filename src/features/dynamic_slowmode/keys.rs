use serenity::all::{ChannelId, GuildId};

/// Sorted set of distinct authors seen in the channel inside the measurement window.
pub fn authors_key(guild_id: GuildId, channel_id: ChannelId) -> String {
    format!("slowmode:authors:{guild_id}:{channel_id}")
}

/// Sorted set of every counted message in the channel inside the measurement window.
pub fn volume_key(guild_id: GuildId, channel_id: ChannelId) -> String {
    format!("slowmode:volume:{guild_id}:{channel_id}")
}

/// Marks a channel as benched after a 429.
pub fn bench_key(channel_id: ChannelId) -> String {
    format!("slowmode:bench:{channel_id}")
}
