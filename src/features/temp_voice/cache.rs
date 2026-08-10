use crate::features::temp_voice::keys;
use crate::{Data, Error};
use fred::interfaces::HashesInterface;
use serenity::all::{ChannelId, GuildId, UserId};

async fn get_owned_temp_vc(
    data: &Data, guild_id: GuildId, user_id: UserId
) -> Result<Option<ChannelId>, Error> {
    let key = keys::temp_vc_owners_key(guild_id);
    let field = user_id.get().to_string();

    let channel_id: Option<String> = data.redis.hget(&key, &field).await?;
    Ok(channel_id.and_then(|s| s.parse::<u64>().ok()).map(ChannelId::new))
}

pub async fn find_active_temp_vc(
    data: &Data,
    guild_id: Option<GuildId>,
    user_id: UserId,
) -> Result<Result<(ChannelId, GuildId), &'static str>, Error> {
    let Some(guild_id) = guild_id else {
        return Ok(Err("This can only be used in a server."));
    };

    match get_owned_temp_vc(data, guild_id, user_id).await? {
        Some(channel_id) => Ok(Ok((channel_id, guild_id))),
        None => Ok(Err("You don't currently have an active temp voice channel.")),
    }
}

pub async fn store_user_vc_on_join(data: &Data, guild_id: GuildId, channel_id: ChannelId, user_id: UserId) -> Result<(), Error> {
    let guild_vc_key = keys::guild_vc_key(guild_id);
    let redis = &data.redis;
    let _: () = redis.hset(&guild_vc_key, (user_id.get(), channel_id.get())).await?;

    Ok(())
}

pub async fn delete_user_vc_on_leave(data: &Data, guild_id: GuildId, user_id: UserId) -> Result<(), Error> {
    let guild_vc_key = keys::guild_vc_key(guild_id);
    let redis = &data.redis;
    let _: () = redis.hdel(&guild_vc_key, user_id.get()).await?;

    Ok(())
}

pub async fn get_user_vc(data: &Data, guild_id: GuildId, user_id: UserId) -> Result<Option<ChannelId>, Error> {
    let guild_vc_key = keys::guild_vc_key(guild_id);
    let redis = &data.redis;
    let channel_id: Option<u64> = redis.hget(&guild_vc_key, user_id.get()).await?;

    Ok(channel_id.map(ChannelId::new))
}