use crate::core::config::state::{BotData, Error};
use fred::interfaces::{HashesInterface, KeysInterface};
use serenity::all::{ChannelId, Context, Guild, GuildId, UserId};

/// Redis key mapping a guild's users to the voice channel they are in.
#[must_use]
pub fn guild_vc_key(guild_id: GuildId) -> String {
    format!("vc:{guild_id}")
}

/// What the framework's cache knows about a member's voice presence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CachedPresence {
    /// The guild is not cached, so the cache says nothing about this member.
    Unknown,
    /// The member is in a voice channel.
    In(ChannelId),
    /// The member is not in a voice channel.
    Out,
}

/// Reads a member's voice presence from the framework's cache.
///
/// The gateway delivers voice state updates in order and the framework applies them to its cache
/// before the handler runs, so a cached presence that disagrees with the event being handled
/// means a newer update already landed.
#[must_use]
pub fn cached_presence(ctx: &Context, guild_id: GuildId, user_id: UserId) -> CachedPresence {
    let Some(guild) = ctx.cache.guild(guild_id) else {
        return CachedPresence::Unknown;
    };
    match guild
        .voice_states
        .get(&user_id)
        .and_then(|state| state.channel_id)
    {
        Some(channel_id) => CachedPresence::In(channel_id),
        None => CachedPresence::Out,
    }
}

/// Whether a voice state update is obsolete and must not be applied.
///
/// The gateway delivers voice state updates in order, but the handlers run concurrently, so a
/// slower handler can reach its write after a newer one already landed. The framework's cache
/// holds the newer state, and writing the stale one would restore a presence the member lost.
#[must_use]
pub fn is_stale_update(cached: CachedPresence, event_channel: Option<ChannelId>) -> bool {
    match (cached, event_channel) {
        (CachedPresence::Unknown, _) => false,
        (CachedPresence::Out, None) => false,
        (CachedPresence::Out, Some(_)) => true,
        (CachedPresence::In(_), None) => true,
        (CachedPresence::In(current), Some(event)) => current != event,
    }
}

/// Stores a user's voice channel in Redis when they join a voice channel.
///
/// # Errors
/// Returns an error if the Redis write fails.
pub async fn store_user_vc_on_join(
    data: &BotData,
    guild_id: GuildId,
    channel_id: ChannelId,
    user_id: UserId,
) -> Result<(), Error> {
    let guild_vc_key = guild_vc_key(guild_id);
    let redis = &data.core.redis;
    let _: () = redis
        .hset(&guild_vc_key, (user_id.get(), channel_id.get()))
        .await?;

    Ok(())
}

/// Removes a user's voice channel entry from Redis when they leave.
///
/// # Errors
/// Returns an error if the Redis delete fails.
pub async fn delete_user_vc_on_leave(
    data: &BotData,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<(), Error> {
    let guild_vc_key = guild_vc_key(guild_id);
    let redis = &data.core.redis;
    let _: () = redis.hdel(&guild_vc_key, user_id.get()).await?;

    Ok(())
}

/// Returns the voice channel a user is currently in, if cached in Redis.
///
/// # Errors
/// Returns an error if the Redis read fails.
pub async fn get_user_vc_in_guild(
    data: &BotData,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Option<ChannelId>, Error> {
    let guild_vc_key = guild_vc_key(guild_id);
    let redis = &data.core.redis;
    let channel_id: Option<u64> = redis.hget(&guild_vc_key, user_id.get()).await?;

    Ok(channel_id.map(ChannelId::new))
}

/// Rebuilds the Redis voice channel mapping for a guild from its current
/// voice states.
///
/// # Errors
/// Returns an error if the Redis write fails.
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

#[cfg(test)]
mod tests {
    use super::{CachedPresence, is_stale_update};
    use serenity::all::ChannelId;

    const OLD: ChannelId = ChannelId::new(111);
    const NEW: ChannelId = ChannelId::new(222);

    #[test]
    fn a_join_to_the_cached_channel_is_current() {
        assert!(!is_stale_update(CachedPresence::In(OLD), Some(OLD)));
    }

    #[test]
    fn a_join_to_a_different_channel_is_stale() {
        assert!(is_stale_update(CachedPresence::In(NEW), Some(OLD)));
    }

    #[test]
    fn a_join_after_the_member_left_is_stale() {
        assert!(is_stale_update(CachedPresence::Out, Some(OLD)));
    }

    #[test]
    fn a_leave_while_the_member_is_in_voice_is_stale() {
        assert!(is_stale_update(CachedPresence::In(OLD), None));
    }

    #[test]
    fn a_leave_after_the_member_left_is_current() {
        assert!(!is_stale_update(CachedPresence::Out, None));
    }

    #[test]
    fn an_uncached_guild_is_never_stale() {
        assert!(!is_stale_update(CachedPresence::Unknown, Some(OLD)));
        assert!(!is_stale_update(CachedPresence::Unknown, None));
    }
}
