use crate::core::config::get_settings;
use crate::events::handlers::levels::cache::save_user_level_cache;
use crate::events::handlers::levels::utils::apply_level_rewards;
use crate::events::handlers::levels::voice::{handler, notify};
use crate::events::handlers::levels::{calculation, database, effects, rules, utils};
use crate::types::config::leveling::{LevelingConfig, NotificationScope};
use crate::types::leveling::UserLevel;
use crate::types::{Data, Error};
use fred::prelude::{Expiration, KeysInterface};
use serenity::all::{ChannelId, Context, GuildId, Member, RoleId, User, UserId};
use tracing::{debug, info, trace};

pub async fn award_vc_xp_for_session(
    ctx: &Context,
    guild_id: GuildId,
    user_id: UserId,
    member_opt: Option<Member>,
    channel_id: ChannelId,
    join_time: i64,
    leave_time: i64,
    data: &Data,
) -> Result<(), Error> {
    let elapsed_seconds = leave_time - join_time;

    if session_too_short(guild_id, user_id, elapsed_seconds) {
        return Ok(());
    }

    let Some(leveling_config) = database::load_leveling_config(data, guild_id).await? else {
        return Ok(());
    };

    let member = resolve_member(ctx, guild_id, user_id, member_opt).await?;
    let user_roles: Vec<u64> = member.roles.iter().map(|r| r.get()).collect();

    if rules::should_exclude_from_level_up(&leveling_config, &user_roles, channel_id.get()) {
        trace!(
            guild_id = guild_id.get(),
            user_id = user_id.get(),
            "Skipping XP reward: user or channel is excluded from voice leveling rules"
        );
        return Ok(());
    }

    let stats_key = format!("member:{}:{}", guild_id, user_id);

    let redis = &data.redis;
    let multiplier_key = format!("multipliers:{}", guild_id.get());
    let multiplier = rules::get_voice_multiplier(redis, &multiplier_key, &data.db, &guild_id, channel_id, &member.roles)
        .await?;

    let elapsed_minutes = elapsed_seconds / 60;
    let total_added_xp = calculation::calculate_session_xp(elapsed_minutes, &leveling_config, multiplier);

    debug!(
        guild_id = guild_id.get(),
        user_id = user_id.get(),
        elapsed_minutes,
        total_added_xp,
        "Completed calculations for session voice XP"
    );

    let Some((mut user_level, previous_level)) = handler::apply_xp_and_process_levels(
        data,
        &guild_id,
        &user_id,
        &stats_key,
        &member.user.name,
        &leveling_config,
        total_added_xp,
    )
        .await?
    else {
        debug!(
            guild_id = guild_id.get(),
            user_id = user_id.get(),
            "Skipping voice XP award: user level has hit the leveling cap"
        );
        return Ok(());
    };

    let leveled_up = user_level.current_level != previous_level;

    if leveled_up {
        info!(
            guild_id = guild_id.get(),
            user_id = user_id.get(),
            old_level = previous_level,
            new_level = user_level.current_level,
            "User leveled up in voice channel!"
        );
        handler::handle_level_up(
            ctx,
            data,
            &member.user,
            &user_level,
            &leveling_config,
            &guild_id,
            channel_id,
            previous_level,
        )
            .await?;
    }

    persist_user_level(data, &stats_key, &mut user_level).await?;

    Ok(())
}

fn session_too_short(guild_id: GuildId, user_id: UserId, elapsed_seconds: i64) -> bool {
    if elapsed_seconds < 60 {
        trace!(
            guild_id = guild_id.get(),
            user_id = user_id.get(),
            elapsed_seconds,
            "Skipping XP reward: voice session was too brief (under 60 seconds)"
        );
        true
    } else {
        false
    }
}

async fn resolve_member(
    ctx: &Context,
    guild_id: GuildId,
    user_id: UserId,
    member_opt: Option<Member>,
) -> Result<Member, Error> {
    if let Some(member) = member_opt {
        return Ok(member);
    }

    if let Some(cached) = ctx.cache.member(guild_id, user_id).map(|m| m.clone()) {
        return Ok(cached);
    }

    Ok(guild_id.member(&ctx.http, user_id).await?)
}

async fn persist_user_level(
    data: &Data,
    stats_key: &str,
    user_level: &mut UserLevel,
) -> Result<(), Error> {
    let redis = &data.redis;

    database::update_level(&data.db, user_level).await?;

    let serialized = serde_json::to_string(user_level)?;
    let _: () = save_user_level_cache(&redis, stats_key, serialized).await?;

    Ok(())
}

