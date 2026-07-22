use crate::events::handlers::levels::database;
use crate::types::{Data, Error};
use crate::utils::store_username_relation;
use fred::interfaces::KeysInterface;
use serenity::all::{Context, GuildId, UserId, VoiceState};
use tracing::{debug, trace};

pub mod session;
pub mod xp;
pub mod notify;
mod handler;
mod occupancy;

pub async fn handle_voice_leveling(ctx: &Context, old: Option<&VoiceState>, new: &VoiceState, data: &Data, guild_id: GuildId, user_id: UserId) -> Result<(), Error> {
    if let Some(member) = &new.member {
        if member.user.bot {
            trace!(user_id = user_id.get(), "Skipping voice leveling: user is a bot");
            return Ok(());
        }
    }

    let Some(leveling_config) = database::load_leveling_config(data, guild_id).await? else {
        trace!(user_id = user_id.get(), "Skipping voice leveling: config is unavailable");
        return Ok(());
    };

    let member = new.member.as_ref();
    let redis = &data.redis;
    let session_key = session::session_key(guild_id, user_id);
    let now = chrono::Utc::now().timestamp();

    let old_channel = old.and_then(|o| o.channel_id);
    let old_deafened = old.map(|o| o.self_deaf || o.deaf).unwrap_or(false);
    let old_eligible = old_channel.is_some() && !old_deafened;

    let new_channel = new.channel_id;
    let new_deafened = new.self_deaf || new.deaf;
    let new_eligible = new_channel.is_some() && !new_deafened;

    if old_channel == new_channel && old_eligible == new_eligible {
        // Nothing relevant changed
        let _: Result<(), _> = redis.expire(&session_key, 86400, None).await;
        return Ok(());
    }

    if old_eligible {
        if let Some(old_ch) = old_channel {
            debug!(
                guild_id = guild_id.get(),
                user_id = user_id.get(),
                channel_id = old_ch.get(),
                "Closing voice session (member disconnected, deafened, or switched channels)"
            );

            session::close_session(ctx, data, guild_id, user_id, member, redis, &session_key, now, &leveling_config).await?;

            let remaining = occupancy::remove_occupant(redis, guild_id, old_ch, user_id).await?;
            if remaining < 2 {
                // Dropped to solo (or empty)
                occupancy::pause_channel_clocks(redis, guild_id, old_ch, now).await?;
            }
        }
    }

    if new_eligible {
        if let Some(new_ch) = new_channel {
            let (count_after, was_new) = occupancy::add_occupant(redis, guild_id, new_ch, user_id).await?;
            let count_before = if was_new { count_after - 1 } else { count_after };

            let start_clock = count_after >= 2;

            debug!(
                guild_id = guild_id.get(),
                user_id = user_id.get(),
                channel_id = new_ch.get(),
                start_clock,
                "Opening voice session (member connected or undeafened)"
            );

            session::open_session(redis, guild_id, user_id, new_ch.get(), now, start_clock).await?;

            if count_before < 2 && count_after >= 2 {
                occupancy::resume_channel_clocks(redis, guild_id, new_ch, now).await?;
            }
        }
    }

    Ok(())
}