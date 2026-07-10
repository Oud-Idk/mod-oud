use crate::events::handlers::levels::voice::session;
use crate::types::Error;
use fred::clients::Client;
use fred::interfaces::{KeysInterface, SetsInterface};
use serenity::all::{ChannelId, GuildId, UserId};

fn occupants_key(guild_id: GuildId, channel_id: ChannelId) -> String {
    format!("vc_occupants:{}:{}", guild_id.get(), channel_id.get())
}

/// Adds a user to a channel's eligible-occupant set.
/// Returns (count_after, was_newly_added).
pub async fn add_occupant(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    user_id: UserId,
) -> Result<(i64, bool), Error> {
    let key = occupants_key(guild_id, channel_id);
    let added: i64 = redis.sadd(&key, user_id.get().to_string()).await?;
    let _: Result<(), _> = redis.expire(&key, 86400, None).await;
    let count: i64 = redis.scard(&key).await?;
    Ok((count, added == 1))
}

/// Removes a user from a channel's eligible-occupant set. Returns the count after removal.
pub async fn remove_occupant(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    user_id: UserId,
) -> Result<i64, Error> {
    let key = occupants_key(guild_id, channel_id);
    let _: () = redis.srem(&key, user_id.get().to_string()).await?;
    let count: i64 = redis.scard(&key).await?;
    Ok(count)
}

async fn get_occupants(redis: &Client, guild_id: GuildId, channel_id: ChannelId) -> Result<Vec<u64>, Error> {
    let key = occupants_key(guild_id, channel_id);
    let members: Vec<String> = redis.smembers(&key).await?;
    Ok(members.into_iter().filter_map(|m| m.parse::<u64>().ok()).collect())
}

/// Resumes the accrual clock for every eligible occupant in a channel.
/// Call when the occupant count crosses from <2 up to >=2.
pub async fn resume_channel_clocks(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    now: i64,
) -> Result<(), Error> {
    for uid in get_occupants(redis, guild_id, channel_id).await? {
        session::resume_clock(redis, guild_id, UserId::new(uid), now).await?;
    }
    Ok(())
}

/// Pauses the accrual clock for every remaining eligible occupant in a channel, banking elapsed time.
/// Call when the occupant count drops below 2.
pub async fn pause_channel_clocks(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    now: i64,
) -> Result<(), Error> {
    for uid in get_occupants(redis, guild_id, channel_id).await? {
        session::pause_clock(redis, guild_id, UserId::new(uid), now).await?;
    }
    Ok(())
}