use crate::features::leveling::cache::save_user_level_cache;
use crate::features::leveling::database;
use crate::features::leveling::types::LevelingConfig;
use crate::features::leveling::types::UserLevel;
use anyhow::Result;
use fred::clients::Client;
use sqlx::PgPool;

pub async fn clamp_to_level_cap(
    leveling_config: &LevelingConfig,
    redis: &Client,
    db: &PgPool,
    stats_key: &str,
    user_level: &mut UserLevel,
) -> Result<bool> {
    if leveling_config.level_cap > 0 && user_level.current_level >= leveling_config.level_cap {
        let level_changed = user_level.current_level > leveling_config.level_cap;
        let xp_changed = user_level.current_xp > 0;

        if level_changed {
            user_level.current_level = leveling_config.level_cap;
        }

        if xp_changed {
            user_level.current_xp = 0;
        }

        if level_changed || xp_changed {
            user_level.cumulative_xp =
                calculate_cumulative_xp(user_level.current_level, user_level.current_xp);
            database::update_level(db, user_level).await?;
            let serialized = serde_json::to_string(&user_level)?;
            let _: () = save_user_level_cache(redis, stats_key, serialized).await?;
        }
        return Ok(true);
    }
    Ok(false)
}

pub const fn calculate_xp_needed(level: u32) -> u64 {
    let l = level as u64;
    5 * l.pow(2) + 50 * l + 100
}

pub const fn calculate_cumulative_xp(level: u32, current_xp: u64) -> u64 {
    if level == 0 {
        return current_xp;
    }
    let n = level as u64;

    // Sum of 5*l^2 + 50*l + 100 from l = 0 to n-1
    let sum_sq = (5 * n * (n - 1) * (2 * n - 1)) / 6;
    let sum_linear = 25 * n * (n - 1);
    let sum_const = 100 * n;

    current_xp + sum_sq + sum_linear + sum_const
}

#[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn calculate_level_up(
    leveling_config: &LevelingConfig,
    applied_multiplier: f32,
    user_level: &UserLevel,
) -> (u32, u64) {
    let previous_level = user_level.current_level;
    let base_xp =
        rand::random_range(leveling_config.text.xp_range.min..=leveling_config.text.xp_range.max);
    let gained_xp = (base_xp as f32 * applied_multiplier).round() as u64;
    (previous_level, gained_xp)
}

#[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn calculate_session_xp(elapsed_minutes: u64, config: &LevelingConfig, multiplier: f32) -> u64 {
    (0..elapsed_minutes)
        .map(|_| {
            let base_xp = rand::random_range(config.voice.xp_range.min..=config.voice.xp_range.max);
            (base_xp as f32 * multiplier).round() as u64
        })
        .sum()
}

/// Applies cumulative XP changes and loops through any earned levels.
pub const fn process_level_ups(user_level: &mut UserLevel, level_cap: u32) -> bool {
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