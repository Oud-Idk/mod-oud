use crate::types::{Data, Error};
use serenity::all::ChannelId;
pub async fn mark_ticket_as_closed_db(data: &&Data, channel_id: ChannelId) -> Result<(), Error> {
    sqlx::query!(
        "UPDATE tickets SET status = 'CLOSE', closed_at = NOW() WHERE channel_id = $1",
        channel_id.get() as i64
    )
        .execute(&data.db)
        .await?;
    Ok(())
}

pub async fn update_close_button_db(data: &&Data, channel_id: ChannelId, new_msg_id_i64: i64) -> Result<(), anyhow::Error> {
    sqlx::query!(
            r#"
            UPDATE tickets
            SET message_count = 0,
                last_button_message_id = $1,
                last_activity = CURRENT_TIMESTAMP,
                warned = FALSE
            WHERE channel_id = $2
            "#,
            new_msg_id_i64,
            channel_id.get() as i64
        )
        .execute(&data.db)
        .await?;

    Ok(())
}

