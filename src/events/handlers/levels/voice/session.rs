use crate::types::{Data, Error};
use serde::{Deserialize, Serialize};
use tracing::{debug, trace};

use crate::events::handlers::levels::voice::xp;
use fred::prelude::*;
use serenity::all::{ChannelId, Context, GuildId, Member, UserId};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VcSession {
    pub join_time: i64,
    pub channel_id: u64,
}

/// Saves a new voice session to Redis as a JSON string with a 24-hour expiration.
pub async fn save_session(
    redis: &Client,
    session_key: &str,
    channel_id: u64,
    join_time: i64,
) -> Result<(), Error> {
    trace!(session_key, channel_id, "Saving voice session state to Redis cache");

    let session = VcSession { join_time, channel_id };
    let serialized = serde_json::to_string(&session)?;

    let _: () = redis.set(
        session_key,
        &serialized,
        Some(Expiration::EX(86400)),
        None,
        false,
    ).await?;

    Ok(())
}

/// Retrieves and deletes the voice session from Redis atomically (using GETDEL).
pub async fn consume_session(
    redis: &Client,
    key: &str,
) -> Result<Option<VcSession>, Error> {
    trace!(key, "Retrieving and consuming voice session atomically");

    let cached_session: Option<String> = redis.getdel(key).await?;

    if let Some(session_str) = cached_session {
        if let Ok(session) = serde_json::from_str::<VcSession>(&session_str) {
            return Ok(Some(session));
        }
    }
    Ok(None)
}

pub async fn close_session(
    ctx: &Context,
    data: &Data,
    guild_id: GuildId,
    user_id: UserId,
    member_opt: Option<Member>,
    redis: &Client,
    session_key: &String,
    now: i64
) -> Result<(), Error> {
    trace!(
        guild_id = guild_id.get(),
        user_id = user_id.get(),
        "Attempting to close active voice session"
    );

    if let Some(s) = consume_session(&redis, &session_key).await? {
        let session_duration = now - s.join_time;

        if session_duration >= 10 {
            trace!(
                guild_id = guild_id.get(),
                user_id = user_id.get(),
                duration_secs = session_duration,
                "Awarding voice XP for completed session"
            );

            xp::award_vc_xp_for_session(
                ctx,
                guild_id,
                user_id,
                member_opt,
                ChannelId::new(s.channel_id),
                s.join_time,
                now,
                data,
            )
                .await?;
        } else {
            debug!(
                guild_id = guild_id.get(),
                user_id = user_id.get(),
                duration_secs = session_duration,
                "Discarded voice micro-session (under 10s) to prevent write-thrashing"
            );
        }
    }

    Ok(())
}