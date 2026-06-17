pub fn calculate_xp_needed(level: i32) -> i32 { 5 * level.pow(2) + 50 * level + 100 }

pub fn calculate_cumulative_xp(level: i32, current_xp: i32) -> i32 {
    let mut total = current_xp;
    for l in 0..level {
        total += calculate_xp_needed(l);
    }
    total
}