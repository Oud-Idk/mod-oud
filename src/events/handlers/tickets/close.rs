use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{
    ChannelId, ComponentInteraction, Context, CreateInteractionResponse,
    CreateInteractionResponseMessage, CreateMessage,
};
use std::time::Duration;

pub async fn on_close_ticket(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Defer(CreateInteractionResponseMessage::default()),
        )
        .await?;

    let channel_id = component.channel_id;

    // Purge records from database and redis
    cleanup_ticket_records(data, channel_id).await?;

    // Deletion countdown warning
    channel_id
        .send_message(
            &ctx.http,
            CreateMessage::default().content("Closing ticket and deleting channel in 5 seconds..."),
        )
        .await?;

    tokio::time::sleep(Duration::from_secs(5)).await;

    channel_id.delete(&ctx.http).await?;
    Ok(())
}


async fn cleanup_ticket_records(data: &Data, channel_id: ChannelId) -> Result<(), Error> {
    let channel_id_str = channel_id.get().to_string();

    sqlx::query!(
        "UPDATE tickets SET status = 'CLOSE', closed_at = NOW() WHERE channel_id = $1",
        channel_id.get() as i64
    )
        .execute(&data.db)
        .await?;

    let mut redis_conn = data.redis.clone();

    let _: () = redis::pipe()
        .cmd("SREM").arg("active_tickets").arg(&channel_id_str)
        .cmd("DEL").arg(format!("ticket:{}", channel_id_str))
        .cmd("PUBLISH").arg("ticket_updates").arg(format!("close:{}", channel_id.get()))
        .query_async(&mut redis_conn)
        .await?;

    data.active_tickets.remove(&channel_id.get());

    Ok(())
}