//! The single "subscribe a channel to a feed" flow.
//!
//! Shared by the `/subscribe rss` slash command and the dashboard web API so
//! both paths discover, store, and hand off feeds exactly the same way.

use anyhow::{Result, anyhow};
use serenity::all::{ChannelId, GuildId};
use uuid::Uuid;

use crate::core::config::state::CoreServices;
use crate::features::social_notifications::database::{insert_feed, subscribe_channel};
use crate::features::social_notifications::discovery::{
    derive_feed_secret, discover_feed_kind, request_hub_subscription,
};
use crate::features::social_notifications::types::FeedKind;

/// Outcome of a successful [`subscribe_feed`] call.
pub struct Subscription {
    /// Feed row backing this subscription (feeds are global and keyed by URL).
    pub feed_id: Uuid,
    /// Feed title, falling back to `"Feed"` when the feed has none.
    pub feed_title: String,
    /// `true` when the channel was already subscribed before this call.
    pub already_subscribed: bool,
    /// How the feed delivers new posts.
    pub kind: FeedKind,
    /// `true` when a `WebSub` hub accepted the subscription request.
    pub hub_confirmed: bool,
}

/// Fetches, parses, stores, and subscribes a channel to `url`.
///
/// Internal failures are logged here and returned as generic, user-friendly
/// messages — callers are free to show the error text to their audience.
pub async fn subscribe_feed(
    core: &CoreServices,
    url: &str,
    channel_id: ChannelId,
    guild_id: GuildId,
) -> Result<Subscription> {
    let resp = core
        .reqwest_client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .inspect_err(|e| tracing::error!(error = ?e, %url, "Failed to fetch feed URL"))
        .map_err(|_| {
            anyhow!("Could not fetch that URL. Make sure it points to a public RSS/Atom feed.")
        })?;

    let body = resp
        .text()
        .await
        .inspect_err(|e| tracing::error!(error = ?e, %url, "Failed to read feed body"))
        .map_err(|_| anyhow!("Could not read that feed's contents."))?;

    let feed = feed_rs::parser::parse(body.as_bytes())
        .inspect_err(|e| tracing::error!(error = ?e, %url, "Failed to parse feed"))
        .map_err(|_| anyhow!("That URL does not look like a valid RSS or Atom feed."))?;

    let feed_title = feed.title.map_or_else(|| "Feed".to_string(), |t| t.content);
    let kind = discover_feed_kind(url, &body);

    let feed_id = insert_feed(&core.db, url, &kind)
        .await
        .inspect_err(|e| tracing::error!(error = ?e, %url, "Failed to store feed"))
        .map_err(|_| anyhow!("Something went wrong on our end. Please try again."))?;

    let is_new = subscribe_channel(&core.db, feed_id, channel_id, guild_id)
        .await
        .inspect_err(|e| tracing::error!(error = ?e, %url, "Failed to subscribe channel"))
        .map_err(|_| anyhow!("Something went wrong on our end. Please try again."))?;

    let already_subscribed = !is_new;

    // Nothing left to hand off when this channel was already subscribed.
    if already_subscribed {
        return Ok(Subscription {
            feed_id,
            feed_title,
            already_subscribed,
            kind,
            hub_confirmed: false,
        });
    }

    let mut hub_confirmed = false;

    if let FeedKind::PubSubHubbub { hub_url, topic, .. } = &kind {
        let master_secret = core
            .config
            .internal_api_secret
            .as_deref()
            .ok_or_else(|| {
                tracing::error!("INTERNAL_API_SECRET is not set, cannot sign WebSub callbacks");
                anyhow!(
                    "Missing internal API secret. Please ask the bot's administrator to fix this."
                )
            })?;

        let callback_url = format!("{}/websub/{}", core.config.domain, feed_id);
        let secret = derive_feed_secret(master_secret, &feed_id);

        match request_hub_subscription(
            &core.reqwest_client,
            hub_url,
            topic,
            &callback_url,
            &secret,
        )
        .await
        {
            Ok(()) => hub_confirmed = true,
            Err(e) => tracing::error!(error = ?e, %feed_id, "Failed to subscribe to WebSub hub"),
        }
    }

    Ok(Subscription {
        feed_id,
        feed_title,
        already_subscribed,
        kind,
        hub_confirmed,
    })
}
