use crate::core::config::state::Error;
use crate::features::tickets::keys;
use crate::shared::task;
use fred::clients::{Client, SubscriberClient};
use fred::interfaces::{EventInterface, PubsubInterface};
use fred::types::scan::Scanner;
use futures_util::{StreamExt, pin_mut};
use moka::future::Cache;
use serenity::all::ChannelId;
use tracing::{debug, info, instrument, warn};

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
                            warn!(raw_value = %key_str, "set member parse failed");
                        }
                    }
                } else {
                    warn!("redis set value to string conversion failed");
                }
            }
        }

        sscan_result.next();
    }

    debug!(
        total_elements = all_members.len(),
        pages_scanned,
        "redis set scan finished"
    );
    Ok(all_members)
}

#[instrument(skip(redis_client, cache))]
async fn hydrate_active_tickets(
    redis_client: &Client,
    cache: &Cache<ChannelId, ()>,
) -> Result<(), Error> {
    cache.invalidate_all();

    // Serenity's ChannelId implements std::str::FromStr, so scan_all_set_members parses directly into ChannelId
    let active_channels: Vec<ChannelId> =
        scan_all_set_members(redis_client, keys::active_tickets_key(), 250).await?;
    let count = active_channels.len();

    for channel_id in active_channels {
        cache.insert(channel_id, ()).await;
    }

    info!(
        hydrated_count = count,
        "hydrated active tickets into local cache"
    );
    Ok(())
}

/// Subscribes to ticket pub/sub updates and keeps the local active-tickets cache in sync with Redis.
pub fn sync_tickets(
    redis_client: &Client,
    subscriber_client: &SubscriberClient,
    active_tickets_cache: &Cache<ChannelId, ()>,
) {
    let cache_clone = active_tickets_cache.clone();

    subscriber_client.on_message(move |msg| {
        let cache = cache_clone.clone();

        async move {
            if msg.channel != keys::ticket_updates_channel() {
                return Ok(());
            }

            let payload = match msg.value.convert::<String>() {
                Ok(val) => val,
                Err(e) => {
                    warn!(error = ?e, "ticket pub/sub value to string conversion failed");
                    return Ok(());
                }
            };

            let parts: Vec<&str> = payload.split(':').collect();
            if parts.len() != 2 {
                warn!(payload = %payload, "invalid ticket pub/sub payload format; expected 'action:channel_id'");
                return Ok(());
            }

            let action = parts[0];
            let channel_id = match parts[1].parse::<ChannelId>() {
                Ok(id) => id,
                Err(e) => {
                    warn!(
                        channel_id_raw = %parts[1],
                        error = ?e,
                        "ticket pub/sub channel id parse failed"
                    );
                    return Ok(());
                }
            };

            match action {
                "open" => {
                    cache.insert(channel_id, ()).await;
                    debug!(channel_id = %channel_id, "ticket marked as open in cache");
                }
                "close" => {
                    cache.invalidate(&channel_id).await;
                    debug!(channel_id = %channel_id, "ticket marked as closed and removed from cache");
                }
                unknown => {
                    warn!(
                        action = %unknown,
                        channel_id = %channel_id,
                        "received unknown ticket action"
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
            info!(server = ?server, "redis server reconnected");
            if let Err(e) = hydrate_active_tickets(&redis, &cache).await {
                warn!(error = ?e, "active ticket cache re-hydration after reconnect failed");
            }
            Ok(())
        }
    });

    let redis_clone_startup = redis_client.clone();
    let subscriber_clone_startup = subscriber_client.clone();
    let cache_clone_startup = active_tickets_cache.clone();
    task::spawn("ticket_cache_hydration", async move {
        if let Err(e) = hydrate_active_tickets(&redis_clone_startup, &cache_clone_startup).await {
            warn!(error = ?e, "initial active ticket cache hydration failed");
        }

        match subscriber_clone_startup
            .subscribe(keys::ticket_updates_channel())
            .await
        {
            Ok(()) => {
                info!(
                    channel = keys::ticket_updates_channel(),
                    "ticket updates subscription established"
                );
            }
            Err(e) => {
                warn!(error = ?e, "ticket update subscription failed");
            }
        }
    });
}
