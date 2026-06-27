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