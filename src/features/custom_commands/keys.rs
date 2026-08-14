pub fn custom_command_key(guild_id: u64, cmd_name: &str) -> String {
    format!("cmd:{guild_id}:{cmd_name}")
}