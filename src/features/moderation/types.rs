#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "varchar", rename_all = "SCREAMING_SNAKE_CASE")] // Adjust based on your DB setup
pub enum ActionType {
    Warn,
    DeleteWarning,
    Mute,
    Unmute,
    Kick,
    Ban,
    Unban,
    Softban,
    Lock,
    Pardon,
    Unpardon,
    Unlock,
    GlobalLock,
    GlobalUnlock,
}

pub struct TempBanRecord {
    pub id: i64,
    pub guild_id: i64,
    pub user_id: i64,
}