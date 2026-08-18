use super::super::{cache, calculation, database, notifications, rewards, rules};
use crate::core::config::state::BotData;
use crate::features::leveling;
use crate::features::leveling::keys::member_stats_key;
use crate::features::leveling::types::UserLevel;
use crate::features::leveling::types::{LevelingConfig, NotificationScope};
use anyhow::Result;
use fred::interfaces::KeysInterface;
use poise::serenity_prelude as serenity;
use serenity::all::{ChannelId, Context, GuildId, Member, User, UserId, VoiceState};
use tracing::{debug, trace};

/// Tracks voice sessions and awards voice XP when a user leaves an eligible channel.
pub async fn handle_voice_leveling(
    ctx: &Context,
    old: Option<&VoiceState>,
    new: &VoiceState,
    data: &BotData,
) -> Result<()> {
    let Some(guild_id) = new.guild_id else {
        return Ok(());
    };

    if let Some(member) = &new.member
        && member.user.bot
    {
        return Ok(());
    }

    let user_id = new.user_id;

    let Some(leveling_config) = database::load_leveling_config(data, guild_id).await? else {
        return Ok(());
    };

    let member = new.member.as_ref();
    let redis = &data.core.redis;
    let session_key = leveling::keys::session_key(guild_id, user_id);
    let now = chrono::Utc::now().timestamp();

    let old_channel = old.and_then(|o| o.channel_id);
    let old_deafened = old.is_some_and(|o| o.self_deaf || o.deaf);
    let old_eligible = old_channel.is_some() && !old_deafened;

    let new_channel = new.channel_id;
    let new_deafened = new.self_deaf || new.deaf;
    let new_eligible = new_channel.is_some() && !new_deafened;

    if old_channel == new_channel && old_eligible == new_eligible {
        let _: Result<(), _> = redis.expire(&session_key, 86400, None).await;
        return Ok(());
    }

    if old_eligible && let Some(old_ch) = old_channel {
        debug!(
            %guild_id,
            user_id = user_id.get(),
            "Closing voice session"
        );

        if let Some(session) = cache::consume_session(redis, &session_key, now).await? {
            let eligible_secs = session.accumulated_secs;

            if eligible_secs >= 10 {
                let synthetic_join_time = now - eligible_secs;
                award_vc_xp_for_session(
                    ctx,
                    guild_id,
                    user_id,
                    member,
                    session.channel_id,
                    synthetic_join_time,
                    now,
                    data,
                    &leveling_config,
                )
                .await?;
            } else {
                debug!(
                    %guild_id,
                    user_id = user_id.get(),
                    "Discarded brief voice session (<10s)"
                );
            }
        }

        let remaining = cache::remove_occupant(redis, guild_id, old_ch, user_id).await?;
        if remaining < 2 {
            cache::pause_channel_clocks(redis, guild_id, old_ch, now).await?;
        }
    }

    // MEMBER JOINED VC AND IS ELIGIBLE
    if new_eligible && let Some(new_ch) = new_channel {
        let (count_after, was_new) = cache::add_occupant(redis, guild_id, new_ch, user_id).await?;
        let count_before = if was_new {
            count_after - 1
        } else {
            count_after
        };
        let start_clock = count_after >= 2;

        cache::open_session(redis, guild_id, user_id, new_ch, now, start_clock).await?;

        if count_before < 2 && count_after >= 2 {
            cache::resume_channel_clocks(redis, guild_id, new_ch, now).await?;
        }
    }

    Ok(())
}

async fn award_vc_xp_for_session(
    ctx: &Context,
    guild_id: GuildId,
    user_id: UserId,
    member_opt: Option<&Member>,
    channel_id: ChannelId,
    join_time: i64,
    leave_time: i64,
    data: &BotData,
    leveling_config: &LevelingConfig,
) -> Result<()> {
    let elapsed_seconds = leave_time - join_time;

    if session_too_short(elapsed_seconds) {
        return Ok(());
    }

    let redis = &data.core.redis;
    let db = &data.core.db;

    let member = &resolve_member(ctx, guild_id, user_id, member_opt).await?;

    if rules::should_exclude_from_level_up(leveling_config, &member.roles, channel_id) {
        trace!(
            %guild_id,
            "Skipping voice XP: channel/user is excluded"
        );
        return Ok(());
    }

    let stats_key = member_stats_key(guild_id, user_id);
    let multiplier_key = leveling::keys::multiplier_key(guild_id);
    let multiplier = rules::get_voice_multiplier(
        redis,
        &multiplier_key,
        db,
        guild_id,
        channel_id,
        &member.roles,
    )
    .await?;

    let elapsed_minutes = elapsed_seconds / 60;
    let total_added_xp =
        calculation::calculate_session_xp(elapsed_minutes, leveling_config, multiplier);

    let Some((mut user_level, previous_level)) = apply_xp_and_process_levels(
        data,
        guild_id,
        user_id,
        &stats_key,
        &member.user.name,
        leveling_config,
        total_added_xp,
    )
    .await?
    else {
        return Ok(());
    };

    let leveled_up = user_level.current_level != previous_level;

    if leveled_up {
        handle_level_up(
            ctx,
            data,
            &member.user,
            &user_level,
            leveling_config,
            guild_id,
            channel_id,
            previous_level,
        )
        .await?;
    }

    persist_user_level(data, &stats_key, &mut user_level).await?;
    Ok(())
}

const fn session_too_short(elapsed_seconds: i64) -> bool {
    elapsed_seconds < 60
}

async fn resolve_member(
    ctx: &Context,
    guild_id: GuildId,
    user_id: UserId,
    member_opt: Option<&Member>,
) -> Result<Member> {
    if let Some(member) = member_opt {
        return Ok(member.clone());
    }
    if let Some(cached) = ctx
        .cache
        .guild(guild_id)
        .and_then(|g| g.members.get(&user_id).cloned())
    {
        return Ok(cached);
    }
    Ok(guild_id.member(&ctx.http, user_id).await?)
}

async fn persist_user_level(
    data: &BotData,
    stats_key: &str,
    user_level: &mut UserLevel,
) -> Result<()> {
    database::update_level(&data.core.db, user_level).await?;
    let serialized = serde_json::to_string(user_level)?;
    let _: () = cache::save_user_level_cache(&data.core.redis, stats_key, serialized).await?;
    Ok(())
}

async fn apply_xp_and_process_levels(
    data: &BotData,
    guild_id: GuildId,
    user_id: UserId,
    stats_key: &str,
    username: &str,
    leveling_config: &LevelingConfig,
    total_added_xp: i32,
) -> Result<Option<(UserLevel, i32)>> {
    let redis = &data.core.redis;

    let mut user_level =
        database::get_user_level(redis, &data.core.db, guild_id, user_id, stats_key, username)
            .await?;

    let should_be_clamped = calculation::clamp_to_level_cap(
        leveling_config,
        redis,
        &data.core.db,
        stats_key,
        &mut user_level,
    )
    .await?;
    if should_be_clamped {
        return Ok(None);
    }

    let previous_level = user_level.current_level;
    user_level.current_xp += total_added_xp;

    calculation::process_level_ups(&mut user_level, leveling_config.level_cap as i32);

    if leveling_config.level_cap > 0 && user_level.current_level >= leveling_config.level_cap as i32
    {
        user_level.current_level = leveling_config.level_cap as i32;
        user_level.current_xp = 0;
    }

    user_level.cumulative_xp =
        calculation::calculate_cumulative_xp(user_level.current_level, user_level.current_xp);

    Ok(Some((user_level, previous_level)))
}

async fn handle_level_up(
    ctx: &Context,
    data: &BotData,
    user: &User,
    user_level: &UserLevel,
    config: &LevelingConfig,
    guild_id: GuildId,
    channel_id: ChannelId,
    previous_level: i32,
) -> Result<()> {
    if !matches!(config.notify.scope, NotificationScope::None) {
        notifications::send_voice_level_up_message(
            ctx,
            user,
            user_level,
            config,
            guild_id,
            channel_id,
            previous_level,
        )
        .await?;
    }

    let _ = rewards::apply_level_rewards(
        ctx,
        &data.core.db,
        guild_id,
        user.id,
        user_level.current_level,
    )
    .await;
    Ok(())
}
