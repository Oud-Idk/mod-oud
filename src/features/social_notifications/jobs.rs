use std::sync::Arc;
use std::time::Duration;
use anyhow::Context;
use chrono::Utc;
use feed_rs::parser;
use serenity::all::{CreateMessage, Http};
use sqlx::PgPool;
use tracing::{error, info, instrument, warn};
use tracing::log::trace;
use uuid::Uuid;
use crate::shared::task;
use crate::features::social_notifications::database;
use crate::features::social_notifications::discovery::{derive_feed_secret, request_hub_subscription};
use crate::features::social_notifications::embed::build_entry_embed;
use crate::shared::locking::acquire_lock;


/// Runs every 30 seconds. Checks and fetches feeds that are due for polling.
pub fn start_feed_polling_worker(
    db: PgPool,
    http: Arc<Http>,
    redis_client: fred::clients::Client,
) {
    let worker_id = format!("worker-polling-{}", Utc::now().timestamp_millis());

    task::spawn("feed_polling_worker", run_feed_polling_worker(
        db,
        http,
        redis_client,
        worker_id,
    ));
}

/// The polling loop itself, spawned under a span so a panic carries the worker
/// identity and whatever the loop was doing when it died.
#[instrument(name = "feed_polling_worker", skip_all, fields(worker_id = %worker_id))]
async fn run_feed_polling_worker(
    db: PgPool,
    http: Arc<Http>,
    redis_client: fred::clients::Client,
    worker_id: String,
) {
    let lock_key = "lock:feed_polling_worker";
    let lock_value = &worker_id;

    info!("rss feed polling worker started");

    let http_client = reqwest::Client::builder()
        .user_agent("Discord-RSS-Bot/1.0")
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_default();

    loop {
        tokio::time::sleep(Duration::from_secs(30)).await;

        // Heartbeat = 5s (Watchdog auto-extends with 15s safety ceiling)
        match acquire_lock(&redis_client, lock_key, lock_value, 5).await {
            Ok(Some(guard)) => {
                trace!("polling lock acquired");

                if let Err(e) = poll_due_feeds(&db, &http, &http_client).await {
                    warn!(error = ?e, "due rss feed poll failed");
                }

                match guard.release().await {
                    Ok(true) => trace!("polling lock released"),
                    Ok(false) => warn!("polling lock lost during execution"),
                    Err(e) => warn!(error = ?e, "polling lock release failed"),
                }
            }
            Ok(None) => trace!("polling lock held by another instance"),
            Err(e) => warn!(error = ?e, "feed polling lock acquisition failed"),
        }
    }
}

/// Runs once every hour. Renews WebSub hub subscriptions expiring in the next 24h.
pub fn start_websub_renewal_worker(
    db: PgPool,
    redis_client: fred::clients::Client,
    reqwest_client: reqwest::Client,
    domain: String,
    internal_secret: Option<String>,
) {
    let worker_id = format!("worker-websub-{}", Utc::now().timestamp_millis());

    task::spawn("websub_renewal_worker", run_websub_renewal_worker(
        db,
        redis_client,
        reqwest_client,
        domain,
        internal_secret,
        worker_id,
    ));
}

/// The renewal loop itself, spawned under a span so a panic carries the worker
/// identity and whatever the loop was doing when it died.
#[instrument(name = "websub_renewal_worker", skip_all, fields(worker_id = %worker_id))]
async fn run_websub_renewal_worker(
    db: PgPool,
    redis_client: fred::clients::Client,
    reqwest_client: reqwest::Client,
    domain: String,
    internal_secret: Option<String>,
    worker_id: String,
) {
    let lock_key = "lock:websub_renewal_worker";
    let lock_value = &worker_id;

    info!("websub renewal worker started");

    loop {
        tokio::time::sleep(Duration::from_secs(3600)).await;

        match acquire_lock(&redis_client, lock_key, lock_value, 5).await {
            Ok(Some(guard)) => {
                trace!("WebSub renewal lock acquired");

                if let Err(e) = renew_expiring_leases(&db, domain.clone(), &reqwest_client, internal_secret.as_deref()).await {
                    warn!(error = ?e, "WebSub lease renewal failed");
                }

                // The poller logs release failures; a renewal that cannot hand
                // the lock back is just as stuck and must not vanish.
                match guard.release().await {
                    Ok(true) => trace!("WebSub renewal lock released"),
                    Ok(false) => warn!("WebSub renewal lock lost during execution"),
                    Err(e) => warn!(error = ?e, "WebSub renewal lock release failed"),
                }
            }
            Ok(None) => trace!("WebSub renewal lock held by another instance"),
            Err(e) => warn!(error = ?e, "WebSub renewal lock acquisition failed"),
        }
    }
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
                warn!(feed_id = %feed_id, url = %feed_row.url, error = ?e, "feed fetch failed");
                if let Err(mark_err) = database::mark_feed_polled(db, feed_id).await {
                    warn!(
                        error = ?mark_err,
                        feed_id = %feed_id,
                        "feed poll marker write failed; the feed is retried immediately"
                    );
                }
                continue;
            }
        };

        let body = match resp.bytes().await {
            Ok(b) => b,
            Err(e) => {
                // Same defect as `let _ =`, different syntax: a body that cannot be
                // read silently skips the feed, which then re-polls immediately.
                warn!(
                    error = ?e,
                    feed_id = %feed_id,
                    url = %feed_row.url,
                    "feed body read failed; this poll cycle is skipped"
                );
                if let Err(mark_err) = database::mark_feed_polled(db, feed_id).await {
                    warn!(
                        error = ?mark_err,
                        feed_id = %feed_id,
                        "feed poll marker write failed; the feed is retried immediately"
                    );
                }
                continue;
            }
        };

        let Ok(parsed_feed) = parser::parse(&body[..]) else {
            warn!(feed_id = %feed_id, "malformed XML during polling");
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
    let channels = database::get_subscribed_channels(db, feed_id).await?;

    let embed = build_entry_embed(entry);

    for channel in channels {
        let msg = CreateMessage::new().embed(embed.clone());
        if let Err(e) = channel.send_message(serenity_http, msg).await {
            warn!(
                error = ?e,
                feed_id = %feed_id,
                channel_id = %channel,
                "feed entry delivery failed; the subscriber missed this post"
            );
        }
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

    if expiring.is_empty() {
        return Ok(());
    }

    // Resolved once, up front: a missing secret fails every renewal equally, and
    // there is nothing worth complaining about when no lease needs renewing.
    let internal_api_secret = internal_api_secret.with_context(
        || "Missing internal API secret. Please ask the bot's administrator to fix this."
    )?;

    let mut failed = 0_usize;
    let total = expiring.len();

    for feed in expiring {
        let (Some(hub_url), Some(topic)) = (feed.hub_url, feed.topic) else {
            error!(
                fault = "feed has no hub or topic recorded",
                feed_id = %feed.id,
                "expiring WebSub feed has no hub or topic recorded"
            );
            failed += 1;
            continue;
        };

        let callback_url = format!("{}/websub/{}", domain, feed.id);
        let secret = derive_feed_secret(internal_api_secret, &feed.id);

        // An already-expired lease means the hub stopped delivering a while ago —
        // a very different problem from one that is merely coming up for renewal.
        let lease_expired = feed
            .lease_expires_at
            .is_some_and(|expires_at| expires_at <= Utc::now());

        if lease_expired {
            error!(
                reason = "lease already expired",
                feed_id = %feed.id,
                hub = %hub_url,
                lease_expires_at = ?feed.lease_expires_at,
                "no notifications have been arriving since then"
            );
        }

        if let Err(e) =
            request_hub_subscription(reqwest_client, &hub_url, &topic, &callback_url, &secret).await
        {
            warn!(
                error = ?e,
                feed_id = %feed.id,
                hub = %hub_url,
                "WebSub lease renewal failed; feed delivery stays broken until one succeeds"
            );
            failed += 1;
        } else if !lease_expired {
            info!(feed_id = %feed.id, hub = %hub_url, "WebSub lease renewed");
        }
    }

    if failed > 0 {
        error!(reason = failed, total, "WebSub lease renewal finished with failures");
    }

    Ok(())
}