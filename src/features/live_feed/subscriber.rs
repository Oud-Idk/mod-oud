use crate::core::config::state::Error;
use crate::features::live_feed::LogEvent;
use fred::clients::SubscriberClient;
use fred::prelude::*;
use tokio::sync::broadcast;
use tracing::{debug, info, warn};

/// Subscribes to Redis log channels and forwards parsed events to the broadcast sender.
///
/// # Errors
/// Returns an error if the subscription to the Redis channels fails.
pub async fn start_live_feed_subscriber(
    subscriber_client: SubscriberClient,
    tx: broadcast::Sender<LogEvent>,
) -> Result<(), Error> {
    subscriber_client.on_message(move |msg| {
        let tx = tx.clone();
        async move {
            let channel = msg.channel.to_string();

            let Ok(payload_str) = msg.value.convert::<String>() else {
                warn!(channel = %channel, "redis payload conversion failed");
                return Ok(());
            };

            debug!(
                channel = %channel,
                payload_len = payload_str.len(),
                "received Redis subscription message"
            );

            if LogEvent::REDIS_CHANNELS.contains(&channel.as_str()) {
                if let Some(event) = LogEvent::from_redis(&channel, &payload_str) {
                    if let Err(e) = tx.send(event) {
                        debug!(error = %e, "LogEvent not sent to the broadcast channel");
                    }
                } else {
                    debug!(channel = %channel, "LogEvent parse from the redis payload failed");
                }
            } else {
                debug!(channel = %channel, "received irrelevant payload; skipping");
            }
            Ok(())
        }
    });

    let channels: Vec<Key> = LogEvent::REDIS_CHANNELS
        .iter()
        .map(|&c| Key::from(c))
        .collect();

    subscriber_client.subscribe(channels).await?;
    info!(channels = ?LogEvent::REDIS_CHANNELS, "subscribed to redis channels");

    Ok(())
}
