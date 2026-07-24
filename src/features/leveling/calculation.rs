use crate::features::leveling::cache::save_user_level_cache;
use crate::features::leveling::database;
use crate::features::leveling::types::LevelingConfig;
use crate::features::leveling::types::UserLevel;
use anyhow::Result;
use fred::clients::Client;
use sqlx::PgPool;

pub async fn clamp_to_level_cap(leveling_config: &LevelingConfig, redis: &Client, db: &PgPool, stats_key: &str, user_level: &mut UserLevel) -> Result<bool> {
    if leveling_config.level_cap > 0 && user_level.current_level >= leveling_config.level_cap as i32 {
        let mut needs_update = false;
        if user_level.current_level > leveling_config.level_cap as i32 {
            user_level.current_level = leveling_config.level_cap as i32;
            needs_update = true;
        }
        if user_level.current_xp > 0 {
            user_level.current_xp = 0;
            needs_update = true;
        }
        if needs_update {
            user_level.cumulative_xp = calculate_cumulative_xp(user_level.current_level, user_level.current_xp);
            database::update_level(db, &user_level).await?;
            let serialized = serde_json::to_string(&user_level)?;
            let _: () = save_user_level_cache(redis, stats_key, serialized).await?;
        }
        return Ok(true);
    }
    Ok(false)
}

pub fn calculate_xp_needed(level: i32) -> i32 { 5 * level.pow(2) + 50 * level + 100 }

pub fn calculate_cumulative_xp(level: i32, current_xp: i32) -> i32 {
    if level <= 0 {
        return current_xp;
    }
    let n = level as i64;

    // Sum of 5*l^2 + 50*l + 100 from l = 0 to n-1
    let sum_sq = (5 * n * (n - 1) * (2 * n - 1)) / 6;
    let sum_linear = 25 * n * (n - 1);
    let sum_const = 100 * n;

    current_xp + (sum_sq + sum_linear + sum_const) as i32
}

pub fn calculate_level_up(leveling_config: &LevelingConfig, applied_multiplier: f32, user_level: &mut UserLevel) -> (i32, i32) {
    let previous_level = user_level.current_level;
    let mut add_level = rand::random_range(leveling_config.text.xp_range.min..=leveling_config.text.xp_range.max);
    add_level = (add_level as f32 * applied_multiplier) as i32;
    (previous_level, add_level)
}

pub fn calculate_session_xp(elapsed_minutes: i64, config: &LevelingConfig, multiplier: f32) -> i32 {
    (0..elapsed_minutes)
        .map(|_| {
            let base_xp = rand::random_range(config.voice.xp_range.min..=config.voice.xp_range.max);
            (base_xp as f32 * multiplier) as i32
        })
        .sum()
}

/// Applies cumulative XP changes and loops through any earned levels.
pub fn process_level_ups(user_level: &mut UserLevel, level_cap: i32) -> bool {
    let mut leveled_up = false;

    loop {
        if level_cap > 0 && user_level.current_level >= level_cap {
            user_level.current_xp = 0;
            break;
        }

        let xp_needed = calculate_xp_needed(user_level.current_level);
        if user_level.current_xp >= xp_needed {
            user_level.current_xp -= xp_needed;
            user_level.current_level += 1;
            leveled_up = true;
        } else {
            break;
        }
    }

    if level_cap > 0 && user_level.current_level >= level_cap {
        user_level.current_level = level_cap;
        user_level.current_xp = 0;
    }

    user_level.cumulative_xp =
        calculate_cumulative_xp(user_level.current_level, user_level.current_xp);

    leveled_up
}