use crate::types::{Context, Error};
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "varchar", rename_all = "snake_case")] // Adjust based on your DB setup
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

pub async fn log_moderation_action(
    ctx: &Context<'_>,
    guild_id: u64,
    target_id: u64,
    moderator_id: u64,
    action_type: ActionType,
    reason: Option<&str>,
    duration: Option<&str>,
) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO moderation_logs (guild_id, target_id, moderator_id, action_type, reason, duration)
         VALUES ($1, $2, $3, $4, $5, $6)",
        guild_id as i64,
        target_id as i64,
        moderator_id as i64,
        action_type as ActionType,
        reason,
        duration
    )
        .execute(&ctx.data().db)
        .await?;

    Ok(())
}