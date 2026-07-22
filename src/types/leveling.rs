use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserLevel {
    pub guild_id: i64,
    pub user_id: i64,
    pub cumulative_xp: i32,
    pub current_level: i32,
    pub current_xp: i32,
}

#[derive(Debug, Clone)]
pub struct LevelReward {
    pub level_requirement: i32,
    pub roles_to_add: Option<Vec<i64>>,
    pub remove_previous_roles: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct XpMultiplier {
    pub target_id: i64,
    pub target_type: String,
    pub multiplier: f32,
}