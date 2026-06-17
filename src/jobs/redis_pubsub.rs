use crate::types::LogEvent;
use futures_util::StreamExt;
use redis::AsyncCommands;
use tokio::sync::broadcast;

pub async fn start_redis_pubsub_listener(
    redis_client: redis::Client,
    local_tx: broadcast::Sender<LogEvent>,
) -> Result<(), crate::types::Error> {
    // Attempt Option 1 first, or fall back to Option 2 if Option 1 fails to compile
    let mut pubsub_conn = redis_client.get_async_pubsub().await?;

    // Subscribe to your target channel
    pubsub_conn.subscribe("channel:log_events").await?;

    // Convert the pubsub connection into a stream of messages
    let mut pubsub_stream = pubsub_conn.into_on_message();

    tokio::spawn(async move {
        println!("Redis Pub/Sub listener started.");

        while let Some(msg) = pubsub_stream.next().await {
            let payload: Vec<u8> = match msg.get_payload() {
                Ok(bytes) => bytes,
                Err(err) => {
                    eprintln!("Failed to read Redis pubsub payload: {}", err);
                    continue;
                }
            };

            match serde_json::from_slice::<LogEvent>(&payload) {
                Ok(event) => {
                    let _ = local_tx.send(event);
                }
                Err(err) => {
                    eprintln!("Failed to deserialize LogEvent: {}", err);
                }
            }
        }
    });

    Ok(())
}

pub async fn publish_log_event(
    redis_client: &redis::Client,
    event: &LogEvent,
) -> Result<(), crate::types::Error> {
    let mut conn = redis_client.get_multiplexed_async_connection().await?;

    // Serialize the event
    let payload = serde_json::to_vec(event)?;

    // Publish to the shared channel
    let _: () = conn.publish("channel:log_events", payload).await?;

    Ok(())
}