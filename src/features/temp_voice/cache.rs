use crate::{Data, Error};
use fred::interfaces::{HashesInterface, KeysInterface};
use serenity::all::{ChannelId, Context, GuildId, UserId, VoiceState};
use tracing::warn;
use crate::features::temp_voice;

async fn get_owned_temp_vc(
    data: &Data, guild_id: GuildId, user_id: UserId
) -> Result<Option<ChannelId>, Error> {
    let key = format!("temp_vc_owners:{}", guild_id);
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

pub async fn refresh_temp_vc_ttl(data: &Data, guild_id: GuildId, channel_id: ChannelId) -> Result<(), Error> {
    let temp_vc_key = format!("temp_vc:{}", channel_id);
    let redis = &data.redis;
    let owner: Option<String> = data.redis.get(&temp_vc_key).await?;

    if let Some(owner_id) = owner {
        let owner_key = format!("temp_vc_owner:{}:{}", guild_id, owner_id);

        let pipeline = redis.pipeline();
        let _: () = pipeline.expire(&temp_vc_key, 86400, None).await?;
        let _: () = pipeline.expire(&owner_key, 86400, None).await?;
        if let Err(e) = pipeline.all::<()>().await {
            warn!("Pipeline when refreshing TTL failed: {:?}", e);
        }
    } else {
        let _: Result<(), _> = data.redis.expire(&temp_vc_key, 86400, None).await;
    }
    Ok(())
}

pub async fn dispatch_refresh_temp_ttl(
    old: Option<&VoiceState>,
    new: &VoiceState,
    data: &Data,
) -> Result<(), Error> {
    let Some(guild_id) = new.guild_id else {
        return Ok(());
    };

    if let Some(channel_id) = new.channel_id {
        refresh_temp_vc_ttl(data, guild_id, channel_id).await?;
    }
    if let Some(old_channel_id) = old.and_then(|o| o.channel_id) {
        refresh_temp_vc_ttl(data, guild_id, old_channel_id).await?;
    }

    Ok(())
}