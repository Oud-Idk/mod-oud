use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{ChannelId, ComponentInteraction, CreateInteractionResponse, CreateInteractionResponseMessage, RoleId};

pub async fn is_ticket_active(redis_conn: &mut redis::aio::MultiplexedConnection, channel_id_str: &str) -> bool {
    redis::cmd("SISMEMBER")
        .arg("active_tickets")
        .arg(channel_id_str)
        .query_async(redis_conn)
        .await
        .unwrap_or(false)
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

    let new_count: i32 = redis::cmd("HINCRBY")
        .arg(ticket_key)
        .arg("message_count")
        .arg(1)
        .query_async(redis_conn)
        .await?;

    let _: () = redis::cmd("HSET")
        .arg(ticket_key)
        .arg("last_activity")
        .arg(&now_ts)
        .query_async(redis_conn)
        .await?;

    let last_button_id: Option<String> = redis::cmd("HGET")
        .arg(ticket_key)
        .arg("last_button_message_id")
        .query_async(redis_conn)
        .await?;

    Ok((new_count, last_button_id))
}

pub fn get_configured_role(role_id_str: &Option<String>) -> Option<RoleId> {
    role_id_str.as_ref()?.parse::<u64>().ok().map(RoleId::new)
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

    let _: () = redis::cmd("SADD")
        .arg("active_tickets")
        .arg(&channel_id_str)
        .query_async(&mut redis_conn)
        .await?;

    let _: () = redis::cmd("HSET")
        .arg(&ticket_key)
        .arg(&[
            ("message_count", "0"),
            ("last_activity", &now_ts),
            ("last_button_message_id", &welcome_msg_id.get().to_string()),
        ])
        .query_async(&mut redis_conn)
        .await?;

    Ok(())
}