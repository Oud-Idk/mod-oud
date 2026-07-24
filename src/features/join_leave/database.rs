use crate::{Data, Error};
pub async fn log_join_to_db(user_id: i64, guild_id: i64, data: &Data) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO join_leave_logs (user_id, guild_id, action) VALUES ($1, $2, 'JOIN')",
        user_id,
        guild_id
    )
        .execute(&data.db)
        .await?;
    Ok(())
}

pub async fn log_leave_to_db(user_id: i64, guild_id: i64, db: &sqlx::PgPool) -> Result<(), Error> {
    sqlx::query!(
        "INSERT INTO join_leave_logs (user_id, guild_id, action) VALUES ($1, $2, 'LEAVE')",
        user_id,
        guild_id
    )
        .execute(db)
        .await?;
    Ok(())
}