use crate::types::config::leveling::LevelingConfig;
use crate::types::leveling::UserLevel;

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