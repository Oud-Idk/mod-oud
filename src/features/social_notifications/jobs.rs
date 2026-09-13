use std::sync::Arc;
use std::time::Duration;
use anyhow::Context;
use feed_rs::parser;
use serenity::all::{CreateEmbed, CreateMessage, Http};
use sqlx::PgPool;
use tracing::{error, info, warn};
use tracing::log::trace;
use uuid::Uuid;
use crate::constants::BRAND_COLOR;
use crate::features::social_notifications::database;
use crate::features::social_notifications::discovery::{derive_feed_secret, request_hub_subscription};
use crate::shared::locking::acquire_lock;


/// Runs every 30 seconds. Checks and fetches feeds that are due for polling.
pub fn start_feed_polling_worker(
    db: PgPool,
    http: Arc<Http>,
    redis_client: fred::clients::Client,
) {
    tokio::spawn(async move {
        let lock_key = "lock:feed_polling_worker";
        let lock_value = format!("worker-polling-{}", chrono::Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "Starting RSS feed polling worker");

        let http_client = reqwest::Client::builder()
            .user_agent("Discord-RSS-Bot/1.0")
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_default();

        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;

            // Heartbeat = 5s (Watchdog auto-extends with 15s safety ceiling)
            match acquire_lock(&redis_client, lock_key, &lock_value, 5).await {
                Ok(Some(guard)) => {
                    trace!("Lock acquired; polling due RSS feeds");

                    if let Err(e) = poll_due_feeds(&db, &http, &http_client).await {
                        error!(error = ?e, "Error during feed polling execution");
                    }

                    match guard.release().await {
                        Ok(true) => trace!("Polling lock released successfully"),
                        Ok(false) => warn!("Polling lock lost during execution"),
                        Err(e) => error!(error = ?e, "Failed to release polling lock"),
                    }
                }
                Ok(None) => trace!("Polling lock held by another instance; skipping"),
                Err(e) => error!(error = ?e, "Failed to acquire feed polling lock"),
            }
        }
    });
}

/// Runs once every hour. Renews WebSub hub subscriptions expiring in the next 24h.
pub fn start_websub_renewal_worker(
    db: PgPool,
    redis_client: fred::clients::Client,
    reqwest_client: reqwest::Client,
    domain: String,
    internal_secret: Option<String>,
) {
    tokio::spawn(async move {
        let lock_key = "lock:websub_renewal_worker";
        let lock_value = format!("worker-websub-{}", chrono::Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "Starting WebSub renewal worker");

        loop {
            tokio::time::sleep(Duration::from_secs(3600)).await;

            match acquire_lock(&redis_client, lock_key, &lock_value, 5).await {
                Ok(Some(guard)) => {
                    trace!("Lock acquired; renewing expiring WebSub leases");

                    if let Err(e) = renew_expiring_leases(&db, domain.clone(), &reqwest_client, internal_secret.as_deref()).await {
                        error!(error = ?e, "Error renewing WebSub leases");
                    }

                    let _ = guard.release().await;
                }
                Ok(None) => trace!("WebSub renewal lock held by another instance; skipping"),
                Err(e) => error!(error = ?e, "Failed to acquire WebSub renewal lock"),
            }
        }
    });
}


/// Polls all RSS/Atom feeds that are scheduled for an update.
///
/// # Errors
/// Returns an error if the database query fails or if a transient database error
/// prevents recording seen entries or updating the feed poll timestamp.
pub async fn poll_due_feeds(
    db: &PgPool,
    http: &Arc<Http>,
    client: &reqwest::Client,
) -> Result<(), anyhow::Error> {
    let due_feeds = database::fetch_due_feeds(db).await?;

    for feed_row in due_feeds {
        let feed_id = feed_row.id;
        let is_first_run = feed_row.last_polled_at.is_none();

        let resp = match client.get(&feed_row.url).send().await {
            Ok(r) => r,
            Err(e) => {
                warn!(feed_id = %feed_id, url = %feed_row.url, error = ?e, "Failed to fetch feed");
                let _ = database::mark_feed_polled(db, feed_id).await;
                continue;
            }
        };

        let body = match resp.bytes().await {
            Ok(b) => b,
            Err(_) => continue,
        };

        let Ok(parsed_feed) = parser::parse(&body[..]) else {
            warn!(feed_id = %feed_id, "Malformed XML during polling");
            continue;
        };

        for entry in parsed_feed.entries.iter().rev() {
            let entry_id = if !entry.id.is_empty() {
                entry.id.clone()
            } else if let Some(link) = entry.links.first() {
                link.href.clone()
            } else {
                entry.title.as_ref().map_or("unknown".into(), |t| t.content.clone())
            };

            let newly_inserted = database::insert_seen_entry(db, feed_id, &entry_id).await?;

            if newly_inserted.is_some() && !is_first_run {
                dispatch_entry_to_discord(db, feed_id, http, entry).await?;
            }
        }

        database::mark_feed_polled(db, feed_id).await?;
    }

    Ok(())
}

async fn dispatch_entry_to_discord(
    db: &PgPool,
    feed_id: Uuid,
    serenity_http: &Arc<Http>,
    entry: &feed_rs::model::Entry,
) -> Result<(), anyhow::Error> {
    let title = entry.title.as_ref().map_or("New Post", |t| &t.content);
    let link = entry.links.first().map_or("", |l| &l.href);
    let summary = entry.summary.as_ref().map_or("", |s| &s.content);

    let channels = database::get_subscribed_channels(db, feed_id).await?;

    let embed = CreateEmbed::new()
        .title(title)
        .url(link)
        .description(summary.chars().take(250).collect::<String>())
        .color(BRAND_COLOR);

    for channel in channels {
        let msg = CreateMessage::new().embed(embed.clone());
        let _ = channel.send_message(serenity_http, msg).await;
    }

    Ok(())
}

/// Formats a new feed entry as a Discord embed and broadcasts it to all subscribed channels.
///
/// # Errors
/// Returns an error if fetching the subscribed channels from the database fails
/// or if a critical HTTP dispatch error occurs.

pub async fn renew_expiring_leases(
    db: &PgPool,
    domain: String,
    reqwest_client: &reqwest::Client,
    internal_api_secret: Option<&str>,
) -> Result<(), anyhow::Error> {
    let expiring = database::fetch_expiring_feeds(db).await?;

    for feed in expiring {
        let hub_url = feed.hub_url.unwrap();
        let topic = feed.topic.unwrap();
        let callback_url = format!("{}/websub/{}", domain, feed.id);
        let internal_api_secret = internal_api_secret.with_context(
            || "Missing internal API secret. Please ask the bot's administrator to fix this."
        )?;
        let secret = derive_feed_secret(internal_api_secret, &feed.id);

        info!(feed_id = %feed.id, "Renewing expiring WebSub lease...");
        let _ = request_hub_subscription(reqwest_client, &hub_url, &topic, &callback_url, &secret).await;
    }

    Ok(())
}