use crate::types::{Data, Error};
use redis::aio::MultiplexedConnection;
use serenity::all::{ChannelId, Context, GuildId, Member, UserId, VoiceState};
use tracing::{debug, trace};

pub mod session;
pub mod xp;

async fn close_session(
    ctx: &Context,
    data: &Data,
    guild_id: GuildId,
    user_id: UserId,
    member_opt: Option<Member>, // Accept Option<Member>
    mut redis: &mut MultiplexedConnection,
    session_key: &String,
    now: i64
) -> Result<(), Error> {
    trace!(
        guild_id = guild_id.get(),
        user_id = user_id.get(),
        "Attempting to close active voice session"
    );

    if let Some(s) = session::consume_session(&mut redis, &session_key).await? {
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
                member_opt, // Pass Member down
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


pub async fn on_voice_state_update(
    ctx: &Context,
    old: Option<&VoiceState>,
    new: &VoiceState,
    data: &Data,
) -> Result<(), Error> {
    let Some(guild_id) = new.guild_id else { return Ok(()) };
    let user_id = new.user_id;

    if let Some(member) = &new.member {
        if member.user.bot {
            trace!(user_id = user_id.get(), "Skipping voice state update: user is a bot");
            return Ok(());
        }
    }

    // Capture the member object from the gateway update payload
    let member = new.member.clone();

    let mut redis = data.redis.clone();
    let session_key = session::get_session_key(guild_id.get(), user_id.get());
    let now = chrono::Utc::now().timestamp();

    let joined_channel = new.channel_id;
    let left_channel = old.and_then(|o| o.channel_id);

    let is_deafened = new.self_deaf || new.deaf;
    let was_deafened = old.map(|o| o.self_deaf || o.deaf).unwrap_or(false);

    let should_close_session = (left_channel.is_some() && joined_channel.is_none()) || (is_deafened && !was_deafened);
    let should_open_session = (joined_channel.is_some() && left_channel.is_none()) || (!is_deafened && was_deafened);
    let switched_channels = left_channel.is_some() && joined_channel.is_some() && left_channel != joined_channel;

    if should_close_session {
        debug!(
            guild_id = guild_id.get(),
            user_id = user_id.get(),
            "Closing voice session (member disconnected or deafened)"
        );
        close_session(ctx, data, guild_id, user_id, member, &mut redis, &session_key, now).await?;
    } else if should_open_session {
        if let Some(channel_id) = joined_channel {
            if !is_deafened {
                debug!(
                    guild_id = guild_id.get(),
                    user_id = user_id.get(),
                    channel_id = channel_id.get(),
                    "Opening voice session (member connected or undeafened)"
                );
                session::save_session(&mut redis, &session_key, channel_id.get(), now).await?;
            }
        }
    } else if switched_channels {
        debug!(
            guild_id = guild_id.get(),
            user_id = user_id.get(),
            old_channel = ?left_channel.map(|c| c.get()),
            new_channel = ?joined_channel.map(|c| c.get()),
            "Handling voice channel switch"
        );
        close_session(ctx, data, guild_id, user_id, member.clone(), &mut redis, &session_key, now).await?;

        if let Some(channel_id) = joined_channel {
            if !is_deafened {
                session::save_session(&mut redis, &session_key, channel_id.get(), now).await?;
            }
        }
    } else {
        let _: Result<(), _> = redis::cmd("EXPIRE")
            .arg(&session_key)
            .arg(86400)
            .query_async(&mut redis)
            .await;
    }

    Ok(())
}