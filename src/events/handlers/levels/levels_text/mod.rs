pub mod calculation;
pub mod notify;

use crate::events::handlers::levels::effects::process_level_ups;
use crate::events::handlers::levels::{database, redis_cache, rules, utils};
use crate::types::config::leveling::{LevelingConfig, NotificationScope};
use crate::types::{Data, Error};
use serde::{Deserialize, Serialize};
use serenity::all::{Context, Message};
use tracing::{debug, info, trace, warn};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserLevel {
    pub(crate) guild_id: String,
    pub(crate) user_id: String,
    pub(crate) cumulative_xp: i32,
    pub(crate) current_level: i32,
    pub(crate) current_xp: i32,
    pub(crate) username: String,
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

pub async fn handle_leveling(
    ctx: &Context,
    message: &Message,
    data: &Data,
    config_maybe: Option<LevelingConfig>
) -> Result<(), Error> {
    let Some(guild_id) = &message.guild_id else { return Ok(()) };
    let Some(leveling_config) = config_maybe else { return Ok(()) };
    if leveling_config.text.enabled == false { return Ok(()) };

    let guild_id_u64 = guild_id.get();
    let author_id = message.author.id.get();
    let channel_id_u64 = message.channel_id.get();

    if data.active_tickets.contains_key(&channel_id_u64) {
        trace!(guild_id = guild_id_u64, channel_id = %channel_id_u64, "Skipping leveling XP: channel is marked as a ticket");
        return Ok(());
    }

    let db = &data.db;
    let author = &message.author;
    let mut add_level = rand::random_range(leveling_config.text.xp_range.min..=leveling_config.text.xp_range.max);

    let mut redis = data.redis.clone();

    let user_roles: Vec<u64> = message.member.as_ref()
        .map(|m|
            m.roles.iter().map(|r|
                r.get()
            ).collect()
        )
        .unwrap_or_default();

    if rules::should_exclude_from_level_up(&leveling_config, &user_roles, channel_id_u64) {
        trace!(guild_id = guild_id_u64, author_id, "Skipping leveling XP: member or channel is excluded");
        return Ok(());
    }

    let cooldown_key = format!("cooldown:{}:{}", guild_id, author.id);
    let set_cooldown = redis_cache::create_redis_cooldown(&cooldown_key, &leveling_config, &redis).await?;

    if !set_cooldown {
        trace!(guild_id = guild_id_u64, author_id, "Skipping leveling XP: user is on XP cooldown");
        return Ok(());
    }

    let stats_key = format!("member:{}:{}", guild_id, author.id);
    let multiplier_key = format!("multipliers:{}", guild_id.get());

    let mut redis_mult = redis.clone();
    let mut redis_level = redis.clone();

    let (applied_multiplier, mut user_level) = tokio::try_join!(
        rules::get_multiplier(&mut redis_mult, &multiplier_key, db, guild_id, message),
        database::get_user_level(&mut redis_level, db, guild_id, &author.id, &stats_key, &author.name)
    )?;

    let should_be_clamped = database::clamp_to_level_cap(&leveling_config, &mut redis, db, &stats_key, &mut user_level).await?;
    if should_be_clamped {
        debug!(guild_id = guild_id_u64, author_id, "Skipping leveling XP: user has already reached the leveling cap");
        return Ok(());
    }

    let previous_level = user_level.current_level;
    add_level = (add_level as f32 * applied_multiplier) as i32;
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

        let ctx_clone = ctx.clone();
        let db_clone = db.clone();
        let msg_clone = message.clone();
        let user_level_clone = user_level.clone();
        let leveling_config_clone = leveling_config.clone();

        let guild_id_val = *guild_id;
        let author_id_val = author.id;
        let previous_level_val = previous_level;
        let current_level_val = user_level.current_level;

        tokio::spawn(async move {
            if !matches!(leveling_config_clone.notify.scope, NotificationScope::None) {
                let embed = &leveling_config_clone.notify.embed;
                trace!(guild_id = guild_id_val.get(), author_id = author_id_val.get(), "Initiating level-up notification");

                if let Err(e) = notify::send_message(
                    &ctx_clone,
                    embed.as_ref(),
                    &msg_clone,
                    &user_level_clone,
                    &leveling_config_clone,
                    &guild_id_val,
                    previous_level_val
                ).await {
                    warn!(error = ?e, "Failed to send level-up notification");
                }
            }

            trace!(guild_id = guild_id_val.get(), author_id = author_id_val.get(), level = current_level_val, "Evaluating reward assignments");
            if let Err(e) = utils::apply_level_rewards(
                &ctx_clone,
                &db_clone,
                &guild_id_val,
                author_id_val,
                current_level_val
            ).await {
                warn!(
                    error = ?e,
                    guild_id = guild_id_val.get(),
                    author_id = author_id_val.get(),
                    level = current_level_val,
                    "Failed to apply leveling role rewards to member"
                );
            }
        });
    }

    let serialized = serde_json::to_string(&user_level)?;
    let guild_id_str = guild_id.get().to_string();
    let guild_pending_key = format!("levels:pending:{}", guild_id_str);
    let user_field = author.id.get().to_string();

    let _: () = redis::pipe()
        .atomic()
        .cmd("SET").arg(&stats_key).arg(&serialized).arg("EX").arg(3600)
        .cmd("HSET").arg(&guild_pending_key).arg(&user_field).arg(&serialized)
        .cmd("SADD").arg("levels:dirty_guilds").arg(&guild_id_str)
        .query_async(&mut redis)
        .await?;

    Ok(())
}