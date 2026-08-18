use crate::core::config::state::{BotData, Error};
use crate::features::tickets::keys;
use fred::clients::Client;
use fred::interfaces::{
    FredResult, HashesInterface, KeysInterface, LuaInterface, PubsubInterface, SetsInterface,
};
use serenity::all::{ChannelId, GuildChannel};
use tracing::debug;

pub fn is_ticket_active(data: &BotData, channel_id: ChannelId) -> bool {
    data.caches.active_tickets.contains_key(&channel_id)
}

pub async fn mark_ticket_as_closed_redis(
    channel_id: ChannelId,
    channel_id_str: &str,
    redis: &Client,
) -> Result<(), Error> {
    debug!("Running Redis pipeline to remove ticket keys and publish close event");
    let pipeline = redis.pipeline();

    let _: () = pipeline
        .srem(keys::active_tickets_key(), channel_id_str)
        .await?;
    let _: () = pipeline.del(keys::ticket_key(channel_id)).await?;
    let _: () = pipeline
        .publish(
            keys::ticket_updates_channel(),
            format!("close:{}", channel_id.get()),
        )
        .await?;
    let _: () = pipeline.all().await?;
    Ok(())
}

pub async fn update_close_button_redis(
    redis: &Client,
    ticket_key: &str,
    new_msg_id_i64: i64,
) -> Result<(), anyhow::Error> {
    let _: () = redis
        .hset(ticket_key, ("last_button_message_id", new_msg_id_i64))
        .await?;
    Ok(())
}

pub async fn publish_open_ticket(redis: &Client, ticket_channel: &GuildChannel) -> FredResult<()> {
    redis
        .publish(
            keys::ticket_updates_channel(),
            format!("open:{}", ticket_channel.id.get()),
        )
        .await
}

pub async fn update_activity_redis(
    redis: &Client,
    ticket_key: &str,
    bump_every: i32,
) -> Result<(bool, Option<String>), Error> {
    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let script = r#"
        local count = tonumber(redis.call("HINCRBY", KEYS[1], "message_count", 1))
        redis.call("HSET", KEYS[1], "last_activity", ARGV[1])
        local limit = tonumber(ARGV[2])
        local last_button = redis.call("HGET", KEYS[1], "last_button_message_id")

        if count >= limit then
            redis.call("HSET", KEYS[1], "message_count", 0)
            return {1, last_button} -- 1 means "Trigger Rotation"
        else
            return {0, last_button} -- 0 means "Do Not Trigger"
        end
    "#;

    let (should_rotate, last_button_id): (i32, Option<String>) =
        redis.eval(script, ticket_key, (now_ts, bump_every)).await?;

    Ok((should_rotate == 1, last_button_id))
}

pub async fn initialize_redis_state(
    data: &BotData,
    channel_id: ChannelId,
    welcome_msg_id: serenity::all::MessageId,
) -> Result<(), Error> {
    let channel_id_str = channel_id.get().to_string();
    let ticket_key = keys::ticket_key(channel_id);

    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let pipeline = data.core.redis.pipeline();

    let _: () = pipeline
        .sadd(keys::active_tickets_key(), &channel_id_str)
        .await?;

    let hset_fields = vec![
        ("message_count", 0u64),
        ("last_activity", now_ts),
        ("last_button_message_id", welcome_msg_id.get()),
    ];
    let _: () = pipeline.hset(&ticket_key, hset_fields).await?;
    let _: () = pipeline
        .publish(
            keys::ticket_updates_channel(),
            format!("open:{}", channel_id.get()),
        )
        .await?;

    let _: () = pipeline.all().await?;

    Ok(())
}
