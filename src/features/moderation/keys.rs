use serenity::all::{ChannelId, GuildId};

/// Redis key under which a channel's pre-lockdown `@everyone` overwrite is cached.
pub fn lockdown_redis_key(guild_id: GuildId, channel_id: ChannelId) -> String {
    format!("lockdown:overwrite:{}:{}", guild_id.get(), channel_id.get())
}