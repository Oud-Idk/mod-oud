use serenity::all::GuildId;

pub fn invites_key(guild_id: GuildId) -> String {
    format!("guild:invites:{guild_id}")
}

pub fn inviters_key(guild_id: GuildId) -> String {
    format!("guild:invite_inviters:{guild_id}")
}

pub fn invited_by_key(guild_id: GuildId) -> String {
    format!("guild:invited_by:{guild_id}")
}

pub fn inviter_counts_key(guild_id: GuildId) -> String {
    format!("guild:inviter_counts:{guild_id}")
}

pub fn codes_by_inviter_key(guild_id: GuildId) -> String {
    format!("guild:codes_by_inviter:{guild_id}")
}