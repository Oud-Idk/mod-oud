pub fn guild_config_key(guild_id: u64) -> String {
    format!("config:guild:{guild_id}")
}

pub fn invalidate_settings_key(guild_id: u64) -> String {
    format!("invalidate:{guild_id}")
}
