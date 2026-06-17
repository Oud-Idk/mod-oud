use crate::types::{Data, Error};
use serenity::all::{ChannelId, Context, VoiceState};

pub mod session;
pub mod xp;

/// Entry point triggered by Serenity's VoiceStateUpdate event.
pub async fn on_voice_state_update(
    ctx: &Context,
    old: Option<&VoiceState>,
    new: &VoiceState,
    data: &Data,
) -> Result<(), Error> {
    let Some(guild_id) = new.guild_id else { return Ok(()) };
    let user_id = new.user_id;

    // Skip bots
    if let Some(member) = &new.member {
        if member.user.bot {
            return Ok(());
        }
    }

    let mut redis = data.redis.clone();
    let session_key = session::get_session_key(guild_id.get(), user_id.get());
    let now = chrono::Utc::now().timestamp();

    let joined_channel = new.channel_id;
    let left_channel = old.and_then(|o| o.channel_id);

    let is_deafened = new.self_deaf || new.deaf;
    let was_deafened = old.map(|o| o.self_deaf || o.deaf).unwrap_or(false);

    // Identify state transitions
    let should_close_session = (left_channel.is_some() && joined_channel.is_none()) || (is_deafened && !was_deafened);
    let should_open_session = (joined_channel.is_some() && left_channel.is_none()) || (!is_deafened && was_deafened);
    let switched_channels = left_channel.is_some() && joined_channel.is_some() && left_channel != joined_channel;

    if should_close_session {
        if let Some(s) = session::consume_session(&mut redis, &session_key).await? {
            xp::award_vc_xp_for_session(
                ctx,
                guild_id,
                user_id,
                ChannelId::new(s.channel_id),
                s.join_time,
                now,
                data,
            )
                .await?;
        }
    } else if should_open_session {
        if let Some(channel_id) = joined_channel {
            if !is_deafened {
                session::save_session(&mut redis, &session_key, channel_id.get(), now).await?;
            }
        }
    } else if switched_channels {
        // Consuming the previous session prevents stale key errors or double-claims
        if let Some(s) = session::consume_session(&mut redis, &session_key).await? {
            xp::award_vc_xp_for_session(
                ctx,
                guild_id,
                user_id,
                ChannelId::new(s.channel_id),
                s.join_time,
                now,
                data,
            )
                .await?;
        }

        // Initialize session for the new voice channel if not deafened
        if let Some(channel_id) = joined_channel {
            if !is_deafened {
                session::save_session(&mut redis, &session_key, channel_id.get(), now).await?;
            }
        }
    }

    Ok(())
}