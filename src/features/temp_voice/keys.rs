use serenity::all::{ChannelId, GuildId};

pub fn temp_vc_owners_key(guild_id: GuildId) -> String {
    format!("temp_vc_owners:{guild_id}")
}
pub fn pending_transfer_key(channel_id: ChannelId) -> String {
    format!("temp_vc_pending_transfer:{channel_id}")
}

pub fn temp_vcs_key(guild_id: GuildId) -> String {
    format!("temp_vcs:{guild_id}")
}
