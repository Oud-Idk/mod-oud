use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice::keys;
use fred::interfaces::HashesInterface;
use serenity::all::{ChannelId, GuildId, UserId};

pub async fn get_owned_temp_vc(
    data: &BotData,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Option<ChannelId>, Error> {
    let key = keys::temp_vc_owners_key(guild_id);
    let field = user_id.get().to_string();

    let channel_id: Option<String> = data.core.redis.hget(&key, &field).await?;
    Ok(channel_id
        .and_then(|s| s.parse::<u64>().ok())
        .map(ChannelId::new))
}
