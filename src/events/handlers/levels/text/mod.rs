pub mod notify;
pub mod handler;

use crate::events::handlers::levels;
use crate::events::handlers::levels::database::get_user_level;
use crate::events::handlers::levels::effects::process_level_ups;
use crate::events::handlers::levels::utils::clamp_to_level_cap;
use crate::events::handlers::levels::{cache, calculation, rules};
use crate::types::config::leveling::LevelingConfig;
use crate::types::{Data, Error};
use crate::utils::store_username_relation;
use serenity::all::{Context, Message};
use tracing::{debug, info, trace};

pub async fn handle_leveling(
    ctx: &Context,
    message: &Message,
    data: &Data,
    config_maybe: Option<LevelingConfig>
) -> Result<(), Error> {
    trace!("Leveling handling received.");
    let Some(guild_id) = &message.guild_id else { return Ok(()) };
    let Some(leveling_config) = config_maybe else { return Ok(()) };
    if !leveling_config.text.enabled { return Ok(()) };

    if handler::should_skip_leveling(message, data, &leveling_config) {
        return Ok(());
    }

    let guild_id_u64 = guild_id.get();
    let author_id = message.author.id.get();
    let author = &message.author;
    let db = &data.db;
    let redis = &data.redis;

    let cooldown_key = format!("cooldown:{}:{}", guild_id, author.id);
    let set_cooldown = cache::create_redis_cooldown(&cooldown_key, &leveling_config, &redis).await?;

    if !set_cooldown {
        trace!(guild_id = guild_id_u64, author_id, "Skipping leveling XP: user is on XP cooldown");
        return Ok(());
    }

    let stats_key = format!("member:{}:{}", guild_id, author.id);
    let multiplier_key = format!("multipliers:{}", guild_id.get());

    let (applied_multiplier, mut user_level) = tokio::try_join!(
        rules::get_multiplier(&redis, &multiplier_key, db, guild_id, message),
        get_user_level(&redis, db, guild_id, &author.id, &stats_key, &author.name)
    )?;

    let should_be_clamped = clamp_to_level_cap(&leveling_config, &redis, db, &stats_key, &mut user_level).await?;
    if should_be_clamped {
        debug!(guild_id = guild_id_u64, author_id, "Skipping leveling XP: user has already reached the leveling cap");
        return Ok(());
    }

    let (previous_level, add_level) = calculation::calculate_level_up(&leveling_config, applied_multiplier, &mut user_level);
    user_level.current_xp += add_level;

    let leveled_up = process_level_ups(&mut user_level, leveling_config.level_cap as i32);

    if leveled_up {
        info!(
            guild_id = guild_id_u64,
            author_id,
            old_level = previous_level,
            new_level = user_level.current_level,
            "User has leveled up!"
        );

        handler::spawn_level_up_effects(
            ctx.clone(),
            &db,
            message.clone(),
            user_level.clone(),
            leveling_config.clone(),
            previous_level,
        );
    }

    cache::save_leveling_cache(
        &redis,
        &stats_key,
        &user_level,
        &guild_id.get().to_string(),
        &author.id.get().to_string(),
    ).await?;

    Ok(())
}

