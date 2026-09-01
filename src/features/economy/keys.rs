use serenity::all::{GuildId, UserId};

pub fn work_cooldown_key(guild_id: GuildId, user_id: UserId) -> String {
    format!("economy:work:{}:{}", guild_id.get(), user_id.get())
}

pub fn rob_cooldown_key(guild_id: GuildId, user_id: UserId) -> String {
    format!("economy:rob:{}:{}", guild_id.get(), user_id.get())
}
