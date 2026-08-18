use serenity::model::id::GuildId;

pub fn bad_word_config_key(guild_id: GuildId) -> String {
    format!("config:guild:{}:bad_words", guild_id.get())
}
