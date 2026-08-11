use crate::core::config::state::{BotData, Error};
use fred::interfaces::{HashesInterface, KeysInterface};
use serenity::all::{ChannelId, Guild, GuildId, UserId};

pub fn guild_vc_key(guild_id: GuildId) -> String {
    format!("vc:{guild_id}")
}

pub async fn store_user_vc_on_join(data: &BotData, guild_id: GuildId, channel_id: ChannelId, user_id: UserId) -> Result<(), Error> {
    let guild_vc_key = guild_vc_key(guild_id);
    let redis = &data.core.redis;
    let _: () = redis.hset(&guild_vc_key, (user_id.get(), channel_id.get())).await?;

    Ok(())
}

pub async fn delete_user_vc_on_leave(data: &BotData, guild_id: GuildId, user_id: UserId) -> Result<(), Error> {
    let guild_vc_key = guild_vc_key(guild_id);
    let redis = &data.core.redis;
    let _: () = redis.hdel(&guild_vc_key, user_id.get()).await?;

    Ok(())
}

pub async fn get_user_vc_in_guild(data: &BotData, guild_id: GuildId, user_id: UserId) -> Result<Option<ChannelId>, Error> {
    let guild_vc_key = guild_vc_key(guild_id);
    let redis = &data.core.redis;
    let channel_id: Option<u64> = redis.hget(&guild_vc_key, user_id.get()).await?;

    Ok(channel_id.map(ChannelId::new))
}

pub async fn sync_guild_voice_state(guild: &Guild, data: &BotData) -> Result<(), Error> {
    let redis = &data.core.redis;

    let guild_vc_key = guild_vc_key(guild.id);

    let _: () = redis.del(&guild_vc_key).await?;

    let entries: Vec<(u64, u64)> = guild
        .voice_states
        .values()
        .filter_map(|vs| vs.channel_id.map(|c| (vs.user_id.get(), c.get())))
        .collect();

    if !entries.is_empty() {
        let _: () = redis.hset(&guild_vc_key, entries).await?;
    }

    Ok(())
}