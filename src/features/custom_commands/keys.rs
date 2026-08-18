use serenity::model::id::GuildId;

pub fn custom_command_key(guild_id: GuildId, cmd_name: &str) -> String {
    format!("cmd:{guild_id}:{cmd_name}")
}
