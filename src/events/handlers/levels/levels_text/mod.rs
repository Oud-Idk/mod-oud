pub mod calculation;
pub mod notify;

use crate::events::handlers::levels::effects::process_level_ups;
use crate::events::handlers::levels::{database, redis_cache, rules, utils};
use crate::types::config::leveling::{LevelingConfig, NotificationScope};
use crate::types::{Data, Error};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serenity::all::{Context, Message};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserLevel {
    pub(crate) guild_id: String,
    pub(crate) user_id: String,
    pub(crate) cumulative_xp: i32,
    pub(crate) current_level: i32,
    pub(crate) current_xp: i32,
}

#[derive(Debug, Clone)]
pub struct LevelReward {
    pub level_requirement: i32,
    pub roles_to_add: Option<Vec<String>>,
    pub remove_previous_roles: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct XpMultiplier {
    pub target_id: String,
    pub target_type: String,
    pub multiplier: f32,
}

pub async fn handle_leveling(ctx: &Context, message: &Message, data: &Data, config_maybe: Option<LevelingConfig>) -> Result<(), Error> {
    let Some(guild_id) = &message.guild_id else { return Ok(()) };
    let Some(leveling_config) = config_maybe else { return Ok(()) };
    if leveling_config.text.enabled == false { return Ok(()) };

    let mut redis = data.redis.clone();

    let channel_id_str = message.channel_id.get().to_string();
    let is_ticket: bool = redis.sismember("active_tickets", &channel_id_str).await.unwrap_or(false);
    if is_ticket {
        return Ok(());
    }

    let db = &data.db;
    let author = &message.author;
    let author_id = &author.id;
    let mut add_level = rand::random_range(leveling_config.text.xp_range.min..=leveling_config.text.xp_range.max);

    if rules::should_exclude_from_level_up(&leveling_config, &author, &mut redis, &(message.channel_id.get() as i64), &guild_id.get(), ctx).await { return Ok(()) }

    let cooldown_key = format!("cooldown:{}:{}", guild_id, author_id);
    let stats_key = format!("member:{}:{}", guild_id, author_id);
    let multiplier_key = format!("multipliers:{}", guild_id.get());

    let set_cooldown = redis_cache::create_redis_cooldown(&cooldown_key, &leveling_config, &redis).await?;

    match set_cooldown {
        true => {}
        false => return Ok(()),
    }

    let applied_multiplier = rules::get_multiplier(&mut redis, &multiplier_key, &db, guild_id, message).await?;
    let mut user_level = database::get_user_level(&mut redis, &db, &guild_id, author_id, &stats_key).await?;

    let should_be_clamped = database::clamp_to_level_cap(&leveling_config, &mut redis, db, &stats_key, &mut user_level).await?;
    if should_be_clamped { return Ok(()) }

    let previous_level = user_level.current_level;
    add_level = (add_level as f32 * applied_multiplier) as i32;
    user_level.current_xp += add_level;

    let leveled_up = process_level_ups(&mut user_level, leveling_config.level_cap as i32);

    if leveled_up {
        let embed = &leveling_config.notify.embed;
        if !matches!(leveling_config.notify.scope, NotificationScope::None) {
            notify::send_message(ctx, embed.as_ref(), message, &user_level, &leveling_config, guild_id, previous_level).await?;
        }

        // Apply level rewards to the user
        if let Err(e) = utils::apply_level_rewards(ctx, db, guild_id, author.id, user_level.current_level).await {
            eprintln!("Error applying level rewards: {}", e);
        }
    }

    database::update_level(db, &user_level).await?;

    let serialized = serde_json::to_string(&user_level)?;
    let _: () = redis.set_ex(&stats_key, serialized, 3600).await?;
    Ok(())
}