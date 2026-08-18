use serenity::all::GuildId;

pub fn guild_config_key(guild_id: GuildId) -> String {
    format!("config:guild:{guild_id}")
}

pub fn invalidate_settings_key(guild_id: GuildId) -> String {
    format!("invalidate:{guild_id}")
}
