use crate::core::config::state::{BotData, Error};

pub async fn log_join_to_db(user_id: i64, guild_id: u64, data: &BotData) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO join_leave_logs (user_id, guild_id, action) VALUES ($1, $2, 'JOIN')",
        user_id,
        guild_id.cast_signed()
    )
        .execute(&data.core.db)
        .await?;
    Ok(())
}

pub async fn log_leave_to_db(user_id: i64, guild_id: u64, db: &sqlx::PgPool) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO join_leave_logs (user_id, guild_id, action) VALUES ($1, $2, 'LEAVE')",
        user_id,
        guild_id.cast_signed()
    )
        .execute(db)
        .await?;
    Ok(())
}