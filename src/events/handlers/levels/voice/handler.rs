use crate::events::handlers::levels::utils::apply_level_rewards;
use crate::events::handlers::levels::voice::notify;
use crate::events::handlers::levels::{calculation, database, effects, utils};
use crate::types::config::leveling::{LevelingConfig, NotificationScope};
use crate::types::leveling::UserLevel;
use crate::types::{Data, Error};
use serenity::all::{ChannelId, Context, GuildId, User, UserId};
use tracing::trace;

pub async fn apply_xp_and_process_levels(
    data: &Data,
    guild_id: &GuildId,
    user_id: &UserId,
    stats_key: &str,
    username: &str,
    leveling_config: &LevelingConfig,
    total_added_xp: i32,
) -> Result<Option<(UserLevel, i32)>, Error> {
    let redis = &data.redis;

    let mut user_level =
        database::get_user_level(&redis, &data.db, guild_id, user_id, stats_key, username)
            .await?;

    let should_be_clamped =
        utils::clamp_to_level_cap(leveling_config, &redis, &data.db, stats_key, &mut user_level)
            .await?;
    if should_be_clamped {
        return Ok(None);
    }

    let previous_level = user_level.current_level;
    user_level.current_xp += total_added_xp;

    effects::process_level_ups(&mut user_level, leveling_config.level_cap as i32);

    // Double-check clamp ensuring no rogue XP remains
    if leveling_config.level_cap > 0 && user_level.current_level >= leveling_config.level_cap as i32 {
        user_level.current_level = leveling_config.level_cap as i32;
        user_level.current_xp = 0;
    }

    // Keep cumulative XP properly synced
    user_level.cumulative_xp =
        calculation::calculate_cumulative_xp(user_level.current_level, user_level.current_xp);

    Ok(Some((user_level, previous_level)))
}

/// Dispatches level notifications and runs rewards functions.
pub async fn handle_level_up(
    ctx: &Context,
    data: &Data,
    user: &User,
    user_level: &UserLevel,
    config: &LevelingConfig,
    guild_id: &GuildId,
    channel_id: ChannelId,
    previous_level: i32,
) -> Result<(), Error> {
    if !matches!(config.notify.scope, NotificationScope::None) {
        trace!(
            guild_id = guild_id.get(),
            user_id = user.id.get(),
            "Evaluating notification dispatcher for voice level up"
        );
        notify::send_voice_level_up_message(
            ctx,
            config.notify.embed.as_ref(),
            user,
            user_level,
            config,
            guild_id,
            channel_id,
            previous_level,
        )
            .await?;
    }

    trace!(
        guild_id = guild_id.get(),
        user_id = user.id.get(),
        level = user_level.current_level,
        "Evaluating level reward assignments"
    );
    let _ = apply_level_rewards(ctx, &data.db, guild_id, user.id, user_level.current_level).await;

    Ok(())
}