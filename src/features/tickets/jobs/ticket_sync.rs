use crate::core::config::state::Error;
use fred::clients::{Client, SubscriberClient};
use fred::interfaces::{EventInterface, PubsubInterface};
use fred::types::scan::Scanner;
use futures_util::{StreamExt, pin_mut};
use moka::future::Cache;
use tracing::{debug, error, info, instrument, warn};

#[instrument(skip(redis), fields(set_key = %set_key))]
pub async fn scan_all_set_members<T>(
    redis: &Client,
    set_key: &str,
    count_per_page: u32,
) -> Result<Vec<T>, fred::error::Error>
where
    T: std::str::FromStr,
{
    let mut all_members = Vec::new();
    let stream = redis.sscan(set_key, "*", Some(count_per_page));
    pin_mut!(stream);

    let mut pages_scanned = 0;
    while let Some(res) = stream.next().await {
        let mut sscan_result = res?;
        pages_scanned += 1;

        if let Some(values) = sscan_result.take_results() {
            for value in values {
                if let Ok(key_str) = value.convert::<String>() {
                    match key_str.parse::<T>() {
                        Ok(item) => {
                            all_members.push(item);
                        }
                        Err(_) => {
                            // T::Err has no trait bounds in std::str::FromStr,
                            // so we log the raw string instead of the error to guarantee compilation.
                            warn!(raw_value = %key_str, "Failed to parse set member into target type");
                        }
                    }
                } else {
                    warn!("Failed to convert Redis set value to String");
                }
            }
        }

        sscan_result.next();
    }

    debug!(
        total_elements = all_members.len(),
        pages_scanned,
        "Completed set scan"
    );
    Ok(all_members)
}

#[instrument(skip(redis_client, cache))]
async fn hydrate_active_tickets(
    redis_client: &Client,
    cache: &Cache<u64, ()>,
) -> Result<(), Error> {
    debug!("Invalidating local ticket cache before hydration");
    cache.invalidate_all();

    let active_channels: Vec<u64> = scan_all_set_members(redis_client, "active_tickets", 250).await?;
    let count = active_channels.len();

    for channel_id in active_channels {
        cache.insert(channel_id, ()).await;
    }

    info!(hydrated_count = count, "Successfully hydrated active tickets into local cache");
    Ok(())
}

pub fn sync_tickets(
    redis_client: &Client,
    subscriber_client: &SubscriberClient,
    active_tickets_cache: &Cache<u64, ()>,
) {
    let cache_clone = active_tickets_cache.clone();

    subscriber_client.on_message(move |msg| {
        let cache = cache_clone.clone();

        async move {
            if msg.channel != "ticket_updates" {
                return Ok(());
            }

            let payload = match msg.value.convert::<String>() {
                Ok(val) => val,
                Err(e) => {
                    warn!(error = ?e, "Failed to convert ticket pub/sub message value to String");
                    return Ok(());
                }
            };

            debug!(payload = %payload, "Processing ticket update pub/sub event");

            let parts: Vec<&str> = payload.split(':').collect();
            if parts.len() != 2 {
                warn!(payload = %payload, "Invalid ticket pub/sub payload format; expected 'action:channel_id'");
                return Ok(());
            }

            let action = parts[0];
            let channel_id = match parts[1].parse::<u64>() {
                Ok(id) => id,
                Err(e) => {
                    warn!(
                        channel_id_raw = %parts[1],
                        error = ?e,
                        "Failed to parse channel ID from ticket pub/sub payload"
                    );
                    return Ok(());
                }
            };

            match action {
                "open" => {
                    cache.insert(channel_id, ()).await;
                    debug!(channel_id = %channel_id, "Ticket marked as open in cache");
                }
                "close" => {
                    cache.invalidate(&channel_id).await;
                    debug!(channel_id = %channel_id, "Ticket marked as closed and removed from cache");
                }
                unknown => {
                    warn!(
                        action = %unknown,
                        channel_id = %channel_id,
                        "Received unknown ticket action"
                    );
                }
            }

            Ok(())
        }
    });

    let redis_clone_reconnect = redis_client.clone();
    let cache_clone_reconnect = active_tickets_cache.clone();
    subscriber_client.on_reconnect(move |server| {
        let redis = redis_clone_reconnect.clone();
        let cache = cache_clone_reconnect.clone();

        async move {
            info!(server = ?server, "Reconnected to Redis server. Re-hydrating active tickets");
            if let Err(e) = hydrate_active_tickets(&redis, &cache).await {
                error!(error = ?e, "Failed to re-hydrate tickets on reconnect");
            }
            Ok(())
        }
    });

    let redis_clone_startup = redis_client.clone();
    let subscriber_clone_startup = subscriber_client.clone();
    let cache_clone_startup = active_tickets_cache.clone();
    tokio::spawn(async move {
        debug!("Performing initial ticket cache hydration on startup");
        if let Err(e) = hydrate_active_tickets(&redis_clone_startup, &cache_clone_startup).await {
            error!(error = ?e, "Failed to initially hydrate active tickets on startup");
        }

        debug!("Subscribing to 'ticket_updates' pub/sub channel");
        match subscriber_clone_startup.subscribe("ticket_updates").await {
            Ok(_) => {
                info!("Subscribed to 'ticket_updates' channel. Auto-reconnect and re-hydration active");
            }
            Err(e) => {
                error!(error = ?e, "Failed to subscribe to 'ticket_updates'");
            }
        }
    });
}