use serenity::model::id::GuildId;

/// The Redis key holding a guild's cached bad word rulesets.
#[must_use]
pub fn bad_word_config_key(guild_id: GuildId) -> String {
    format!("config:guild:{}:bad_words", guild_id.get())
}
