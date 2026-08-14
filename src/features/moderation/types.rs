/// The kind of moderation action performed on a user.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "varchar", rename_all = "SCREAMING_SNAKE_CASE")] // Adjust based on your DB setup
pub enum ActionType {
    /// Issue a formal warning.
    Warn,
    /// Remove a previous warning.
    DeleteWarning,
    /// Mute the user.
    Mute,
    /// Unmute the user.
    Unmute,
    /// Kick the user from the guild.
    Kick,
    /// Ban the user from the guild.
    Ban,
    /// Remove the user's ban.
    Unban,
    /// Ban and immediately unban, deleting recent messages.
    Softban,
    /// Lock the channel.
    Lock,
    /// Pardon a previous action.
    Pardon,
    /// Remove a pardon.
    Unpardon,
    /// Unlock the channel.
    Unlock,
    /// Lock all channels in the guild.
    GlobalLock,
    /// Unlock all channels in the guild.
    GlobalUnlock,
}

/// A temporary ban record tracked in the database.
pub struct TempBanRecord {
    /// ID of the temp ban record.
    pub id: i64,
    /// Guild the ban belongs to.
    pub guild_id: i64,
    /// User who is temporarily banned.
    pub user_id: i64,
}

/// Footer appended to moderation embeds.
pub const MODERATION_FOOTER: &str = "If you believe this was a mistake, please contact an administrator.";
