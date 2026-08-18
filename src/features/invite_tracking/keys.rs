use serenity::{all::GuildId, model::id::UserId};

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

pub fn user_invites_key(guild_id: GuildId, user_id: UserId) -> String {
    format!("guild:user_invites:{guild_id}:{user_id}")
}
