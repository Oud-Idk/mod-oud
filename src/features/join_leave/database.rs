use crate::core::config::state::{BotData, Error};
use serenity::all::{GuildId, UserId};

/// Records a member join event in the join/leave logs table.
///
/// # Errors
/// Returns [`Err`] if Postgres fails to return.
pub async fn log_join_to_db(
    user_id: UserId,
    guild_id: GuildId,
    data: &BotData,
) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO join_leave_logs (user_id, guild_id, action) VALUES ($1, $2, 'JOIN')",
        user_id.get().cast_signed(),
        guild_id.get().cast_signed()
    )
    .execute(&data.core.db)
    .await?;
    Ok(())
}

/// Records a member leave event in the join/leave logs table.
pub async fn log_leave_to_db(
    user_id: UserId,
    guild_id: GuildId,
    db: &sqlx::PgPool,
) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO join_leave_logs (user_id, guild_id, action) VALUES ($1, $2, 'LEAVE')",
        user_id.get().cast_signed(),
        guild_id.get().cast_signed()
    )
    .execute(db)
    .await?;
    Ok(())
}
