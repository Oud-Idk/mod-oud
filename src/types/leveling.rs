use serde::{Deserialize, Serialize};

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