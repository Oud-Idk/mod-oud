use crate::core::config::state::Error;
use crate::features::live_feed::LogEvent;
use fred::clients::SubscriberClient;
use fred::prelude::*;
use tokio::sync::broadcast;
use tracing::{debug, error, info, trace, warn};

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
                warn!(channel = %channel, "Failed to convert Redis message value to String");
                return Ok(());
            };

            debug!(
                channel = %channel,
                payload_len = payload_str.len(),
                "Received Redis subscription message"
            );

            if LogEvent::REDIS_CHANNELS.contains(&channel.as_str()) {
                if let Some(event) = LogEvent::from_redis(&channel, &payload_str) {
                    if let Err(e) = tx.send(event) {
                        error!(error = %e, "Failed to send LogEvent to broadcast channel");
                    }
                } else {
                    warn!(channel = %channel, "Failed to parse LogEvent from Redis payload");
                }
            } else {
                trace!(channel = %channel, "Received irrelevant payload; skipping");
            }
            Ok(())
        }
    });

    let channels: Vec<Key> = LogEvent::REDIS_CHANNELS
        .iter()
        .map(|&c| Key::from(c))
        .collect();

    info!(channels = ?LogEvent::REDIS_CHANNELS, "Subscribing to Redis channels...");
    subscriber_client.subscribe(channels).await?;
    info!("Successfully subscribed to Redis channels");

    Ok(())
}
