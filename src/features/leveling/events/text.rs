use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::leveling;
use crate::features::leveling::calculation::clamp_to_level_cap;
use crate::features::leveling::calculation::process_level_ups;
use crate::features::leveling::database::get_user_level;
use crate::features::leveling::keys::{member_stats_key, multiplier_key};
use crate::features::leveling::rules::get_multiplier;
use crate::features::leveling::types::UserLevel;
use crate::features::leveling::types::{LevelingConfig, NotificationScope};
use crate::features::leveling::{cache, keys, notifications, rewards, rules};
use serenity::all::{Context, Message, RoleId};
use tracing::{debug, info, trace, warn};

/// Grants text chat XP for a message, applying cooldowns, multipliers, and level-ups.
pub async fn handle_text_leveling(
    ctx: &Context,
    message: &Message,
    data: &BotData,
) -> Result<(), Error> {
    if message.author.bot {
        return Ok(());
    }

    let Some(guild_id) = message.guild_id else {
        return Ok(());
    };

    let settings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;
    let config_maybe = settings.leveling;
    let Some(leveling_config) = config_maybe else {
        return Ok(());
    };
    if !leveling_config.text.enabled {
        return Ok(());
    }

    if should_skip_leveling(message, data, &leveling_config) {
        return Ok(());
    }

    let author_id = message.author.id;
    let author = &message.author;
    let db = &data.core.db;
    let redis = &data.core.redis;

    let cooldown_key = keys::cooldown_key(guild_id, author);
    let set_cooldown = cache::create_redis_cooldown(&cooldown_key, &leveling_config, redis).await?;

    if !set_cooldown {
        trace!(
            %guild_id,
            %author_id, "Skipping leveling XP: user is on XP cooldown"
        );
        return Ok(());
    }

    let stats_key = member_stats_key(guild_id, author.id);
    let multiplier_key = multiplier_key(guild_id);

    let (applied_multiplier, mut user_level) = tokio::try_join!(
        Box::pin(get_multiplier(
            redis,
            &multiplier_key,
            db,
            guild_id,
            message
        )),
        Box::pin(get_user_level(
            redis,
            db,
            guild_id,
            author.id,
            &stats_key,
            &author.name
        ))
    )?;

    let should_be_clamped =
        clamp_to_level_cap(&leveling_config, redis, db, &stats_key, &mut user_level).await?;
    if should_be_clamped {
        debug!(
            %guild_id,
            %author_id, "Skipping leveling XP: user has already reached the leveling cap"
        );
        return Ok(());
    }

    let (previous_level, add_level) = leveling::calculation::calculate_level_up(
        &leveling_config,
        applied_multiplier,
        &mut user_level,
    );
    user_level.current_xp += add_level;

    let leveled_up = process_level_ups(&mut user_level, leveling_config.level_cap as i32);

    if leveled_up {
        info!(
            %guild_id,
            %author_id,
            old_level = previous_level,
            new_level = user_level.current_level,
            "User has leveled up!"
        );

        spawn_level_up_effects(
            ctx.clone(),
            db,
            message.clone(),
            user_level.clone(),
            leveling_config.clone(),
            previous_level,
        );
    }

    cache::save_leveling_cache(
        redis,
        &stats_key,
        &user_level,
        &guild_id.get().to_string(),
        &author.id.get().to_string(),
    )
    .await?;

    Ok(())
}

/// Returns true if the message should be excluded from leveling based on tickets,
/// excluded roles, or excluded channels.
pub fn should_skip_leveling(message: &Message, data: &BotData, config: &LevelingConfig) -> bool {
    let guild_id = message.guild_id.map_or(0, serenity::all::GuildId::get);
    let channel_id_u64 = message.channel_id;

    if data.caches.active_tickets.contains_key(&channel_id_u64) {
        trace!(guild_id, channel_id = %channel_id_u64, "Skipping leveling XP: channel is marked as a ticket");
        return true;
    }

    let user_roles: &[RoleId] = message
        .member
        .as_ref()
        .map(|m| m.roles.as_slice())
        .unwrap_or(&[]);

    if rules::should_exclude_from_level_up(config, &user_roles, channel_id_u64) {
        trace!(
            guild_id,
            author_id = message.author.id.get(),
            "Skipping leveling XP: member or channel is excluded"
        );
        return true;
    }

    false
}

/// Spawns a background task to send level-up notifications and apply role rewards.
pub fn spawn_level_up_effects(
    ctx: Context,
    db: &sqlx::PgPool,
    message: Message,
    user_level: UserLevel,
    leveling_config: Box<LevelingConfig>,
    previous_level: i32,
) {
    let guild_id = message.guild_id.unwrap_or_default();
    let author_id = message.author.id;
    let current_level_val = user_level.current_level;
    let db_lvl_up = db.clone();

    tokio::spawn(async move {
        if !matches!(leveling_config.notify.scope, NotificationScope::None) {
            trace!(
                %guild_id,
                %author_id,
                "Initiating level-up notification"
            );

            if let Err(e) = notifications::send_message(
                &ctx,
                &message,
                &user_level,
                &leveling_config,
                &guild_id,
                previous_level,
            )
            .await
            {
                warn!(error = ?e, "Failed to send level-up notification");
            }
        }

        trace!(
            %guild_id,
            %author_id,
            level = current_level_val,
            "Evaluating reward assignments"
        );
        if let Err(e) =
            rewards::apply_level_rewards(&ctx, &db_lvl_up, guild_id, author_id, current_level_val)
                .await
        {
            warn!(
                error = ?e,
                %guild_id,
                %author_id,
                level = current_level_val,
                "Failed to apply leveling role rewards to member"
            );
        }
    });
}
