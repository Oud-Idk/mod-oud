use crate::{Data, Error};
use serenity::all::{ChannelId, GuildId, UserId};
use tracing::{instrument, trace};

pub async fn mark_ticket_as_closed_db(data: &&Data, channel_id: ChannelId) -> Result<(), Error> {
    sqlx::query!(
        "UPDATE tickets SET status = 'CLOSED', closed_at = NOW() WHERE channel_id = $1",
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

#[instrument(skip(data))]
pub async fn save_ticket_to_db(
    data: &Data,
    guild_id: GuildId,
    channel_id: ChannelId,
    user_id: UserId,
    welcome_msg_id: serenity::all::MessageId,
    username: &str,
) -> Result<(), Error> {
    trace!("Executing database write for ticket registration");
    sqlx::query!(
        r#"
        INSERT INTO tickets (guild_id, channel_id, opener_id, last_button_message_id)
        VALUES ($1, $2, $3, $4)
        "#,
        guild_id.get() as i64,
        channel_id.get() as i64,
        user_id.get() as i64,
        welcome_msg_id.get() as i64,
    )
        .execute(&data.db)
        .await?;
    Ok(())
}