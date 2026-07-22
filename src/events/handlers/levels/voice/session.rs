use crate::types::{Data, Error};
use serde::{Deserialize, Serialize};
use tracing::{debug, trace};

use crate::events::handlers::levels::voice::xp;
use crate::types::config::leveling::LevelingConfig;
use fred::prelude::*;
use serenity::all::{ChannelId, Context, GuildId, Member, UserId};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VcSession {
    pub join_time: i64,
    pub channel_id: u64,
    pub accumulated_secs: i64,
    pub clock_started_at: Option<i64>,
}

pub fn session_key(guild_id: GuildId, user_id: UserId) -> String {
    format!("vc_session:{}:{}", guild_id.get(), user_id.get())
}

/// Peeks at a user's session without consuming it.
pub async fn get_session(redis: &Client, key: &str) -> Result<Option<VcSession>, Error> {
    let cached: Option<String> = redis.get(key).await?;
    Ok(match cached {
        Some(s) => serde_json::from_str::<VcSession>(&s).ok(),
        None => None,
    })
}

async fn set_session(redis: &Client, key: &str, session: &VcSession) -> Result<(), Error> {
    let serialized = serde_json::to_string(session)?;
    let _: () = redis
        .set(key, &serialized, Some(Expiration::EX(86400)), None, false)
        .await?;
    Ok(())
}

/// Opens a new voice session for a user who just became eligible (connected + not deafened).
/// `start_clock` should be true if the channel already has another eligible occupant.
pub async fn open_session(
    redis: &Client,
    guild_id: GuildId,
    user_id: UserId,
    channel_id: u64,
    now: i64,
    start_clock: bool,
) -> Result<(), Error> {
    let key = session_key(guild_id, user_id);
    trace!(
        guild_id = guild_id.get(),
        user_id = user_id.get(),
        channel_id,
        start_clock,
        "Opening voice session"
    );

    let session = VcSession {
        join_time: now,
        channel_id,
        accumulated_secs: 0,
        clock_started_at: if start_clock { Some(now) } else { None },
    };
    set_session(redis, &key, &session).await
}

/// Resumes a paused clock (channel crossed from <2 to >=2 eligible occupants). No-op if already running
/// or if the user has no active session.
pub async fn resume_clock(
    redis: &Client,
    guild_id: GuildId,
    user_id: UserId,
    now: i64,
) -> Result<(), Error> {
    let key = session_key(guild_id, user_id);
    if let Some(mut s) = get_session(redis, &key).await? {
        if s.clock_started_at.is_none() {
            trace!(guild_id = guild_id.get(), user_id = user_id.get(), "Resuming voice XP clock");
            s.clock_started_at = Some(now);
            set_session(redis, &key, &s).await?;
        }
    }
    Ok(())
}

/// Pauses a running clock (channel dropped below 2 eligible occupants), banking elapsed time.
/// No-op if already paused or if the user has no active session.
pub async fn pause_clock(
    redis: &Client,
    guild_id: GuildId,
    user_id: UserId,
    now: i64,
) -> Result<(), Error> {
    let key = session_key(guild_id, user_id);
    if let Some(mut s) = get_session(redis, &key).await? {
        if let Some(started) = s.clock_started_at.take() {
            trace!(guild_id = guild_id.get(), user_id = user_id.get(), "Pausing voice XP clock (alone in channel)");
            s.accumulated_secs += (now - started).max(0);
            set_session(redis, &key, &s).await?;
        }
    }
    Ok(())
}

/// Closes a user's session (they disconnected or became ineligible), banking any running clock time,
/// and awards XP for the eligible ("not alone") duration only.
pub async fn close_session(
    ctx: &Context,
    data: &Data,
    guild_id: GuildId,
    user_id: UserId,
    member_opt: Option<&Member>,
    redis: &Client,
    session_key: &str,
    now: i64,
    leveling_config: &LevelingConfig,
) -> Result<(), Error> {
    trace!(
        guild_id = guild_id.get(),
        user_id = user_id.get(),
        "Attempting to close active voice session"
    );

    let Some(mut s) = get_session(redis, session_key).await? else {
        return Ok(());
    };

    if let Some(started) = s.clock_started_at.take() {
        s.accumulated_secs += (now - started).max(0);
    }

    let _: () = redis.del(session_key).await?;

    let eligible_secs = s.accumulated_secs;

    if eligible_secs >= 10 {
        trace!(
            guild_id = guild_id.get(),
            user_id = user_id.get(),
            eligible_secs,
            "Awarding voice XP for completed session"
        );

        // Synthesize a join_time so math yields the banked,
        // "not alone" duration rather than the full connected duration.
        let synthetic_join_time = now - eligible_secs;

        xp::award_vc_xp_for_session(
            ctx,
            guild_id,
            user_id,
            member_opt,
            ChannelId::new(s.channel_id),
            synthetic_join_time,
            now,
            data,
            leveling_config,
        )
            .await?;
    } else {
        debug!(
            guild_id = guild_id.get(),
            user_id = user_id.get(),
            eligible_secs,
            "Discarded voice micro-session (under 10s eligible time) to prevent write-thrashing"
        );
    }

    Ok(())
}