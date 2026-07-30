pub fn bad_word_config_key(guild_id: i64) -> String {
    format!("config:guild:{}:bad_words", guild_id)
}