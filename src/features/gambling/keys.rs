use serenity::all::{GuildId, UserId};

/// Global gambling cooldown Redis key (shared across all games).
pub fn gambling_cooldown_key(guild_id: GuildId, user_id: UserId) -> String {
    format!("gambling:cooldown:{}:{}", guild_id.get(), user_id.get())
}
