use serenity::all::{ChannelId, GuildId, User, UserId};

pub fn member_stats_key(guild_id: &GuildId, target_id: UserId) -> String {
    format!("member:{guild_id}:{target_id}")
}

pub fn multiplier_key(guild_id: &GuildId) -> String {
    format!("multipliers:{}", guild_id.get())
}

pub fn cooldown_key(guild_id: &GuildId, author: &User) -> String {
    format!("cooldown:{}:{}", guild_id, author.id)
}

pub fn occupants_key(guild_id: GuildId, channel_id: ChannelId) -> String {
    format!("vc_occupants:{}:{}", guild_id.get(), channel_id.get())
}

pub fn flushing_levels_key(guild_id_str: &str) -> String {
    format!("levels:flushing:{guild_id_str}")
}

pub fn pending_levels_key(guild_id_str: &str) -> String {
    format!("levels:pending:{guild_id_str}")
}

pub fn session_key(guild_id: GuildId, user_id: UserId) -> String {
    format!("vc_session:{}:{}", guild_id.get(), user_id.get())
}