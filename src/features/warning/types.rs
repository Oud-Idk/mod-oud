use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serenity::all::{GuildId, RoleId, UserId};

pub struct PartialWarning {
    pub(crate) user_id: UserId,
    pub(crate) reason: Option<String>,
}

pub const MODERATION_FOOTER: &str =
    "If you believe this was a mistake, please contact an administrator.";

#[derive(Debug, Clone, Copy, sqlx::Type, PartialEq, Eq, Deserialize, Serialize)]
#[sqlx(type_name = "moderation_action", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WarnAction {
    Timeout,
    Kick,
    Ban,
    RoleRemove,
    RoleAdd,
    RoleRemoveAll,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WarnThreshold {
    pub id: i64,
    pub guild_id: GuildId,
    pub warn_count: i32,
    pub action_type: Vec<WarnAction>,
    pub roles_to_add: Option<Vec<RoleId>>,
    pub roles_to_remove: Option<Vec<RoleId>>,
    pub duration: Option<i32>,
}

/// Intermediate representation of warning data used for unified display.
pub struct WarningInfo {
    pub id: i64,
    pub user_id: UserId,
    pub moderator_id: UserId,
    pub reason: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub is_active: Option<bool>,
}
