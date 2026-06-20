use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{ChannelId, ComponentInteraction, CreateInteractionResponse, CreateInteractionResponseMessage};

pub fn is_ticket_active(data: &Data, channel_id: u64) -> bool {
    data.active_tickets.contains(&channel_id)
}

pub async fn update_redis_activity(
    redis_conn: &mut redis::aio::MultiplexedConnection,
    ticket_key: &str,
) -> Result<(i32, Option<String>), Error> {
    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string();

    let (new_count, _, last_button_id): (i32, (), Option<String>) = redis::pipe()
        .atomic()
        .cmd("HINCRBY").arg(ticket_key).arg("message_count").arg(1)
        .cmd("HSET").arg(ticket_key).arg("last_activity").arg(&now_ts)
        .cmd("HGET").arg(ticket_key).arg("last_button_message_id")
        .query_async(redis_conn)
        .await?;

    Ok((new_count, last_button_id))
}

pub async fn send_missing_config_error(ctx: &serenity::Context, component: &ComponentInteraction) -> Result<(), Error> {
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new()
                    .content("❌ Tickets cannot be opened because the staff role has not been configured by an administrator.")
                    .ephemeral(true),
            ),
        )
        .await?;
    Ok(())
}

pub async fn send_disabled_error(ctx: &serenity::Context, component: &ComponentInteraction) -> Result<(), Error> {
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new()
                    .content("❌ Tickets are currently disabled in this guild.")
                    .ephemeral(true),
            ),
        )
        .await?;
    Ok(())
}


pub async fn initialize_redis_state(
    data: &Data,
    channel_id: ChannelId,
    welcome_msg_id: serenity::all::MessageId,
) -> Result<(), Error> {
    let channel_id_str = channel_id.get().to_string();
    let ticket_key = format!("ticket:{}", channel_id_str);
    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string();

    let mut redis_conn = data.redis.clone();

    let _: () = redis::pipe()
        .cmd("SADD").arg("active_tickets").arg(&channel_id_str)
        .cmd("HSET").arg(&ticket_key).arg(&[
        ("message_count", "0"),
        ("last_activity", &now_ts),
        ("last_button_message_id", &welcome_msg_id.get().to_string()),
    ])
        .cmd("PUBLISH").arg("ticket_updates").arg(format!("open:{}", channel_id.get()))
        .query_async(&mut redis_conn)
        .await?;

    Ok(())
}