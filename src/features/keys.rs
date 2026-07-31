use serenity::all::{GuildId, UserId};

pub fn session_key(guild_id: GuildId, user_id: UserId) -> String {
    format!("vc_session:{}:{}", guild_id.get(), user_id.get())
}