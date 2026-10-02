//! The single "subscribe a channel to a feed" flow.
//!
//! Shared by the `/subscribe rss` slash command and the dashboard web API so
//! both paths discover, store, and hand off feeds exactly the same way.

use serenity::all::{ChannelId, GuildId};
use std::fmt;
use uuid::Uuid;

use crate::core::config::state::CoreServices;
use crate::features::social_notifications::database::{insert_feed, subscribe_channel};
use crate::features::social_notifications::discovery::{
    derive_feed_secret, discover_feed_kind, request_hub_subscription,
};
use crate::features::social_notifications::types::FeedKind;

/// Generic text for failures we caused — the cause itself never reaches the user.
const INTERNAL_ERROR_MESSAGE: &str = "Something went wrong on our end. Please try again.";

/// Why a subscription could not be created.
///
/// The distinction exists for transport layers: an unusable URL is the caller's
/// fault and deserves a 4xx, whereas a failed write is ours and must not be
/// reported as though the user did something wrong. Messages on the first two
/// variants are written for a human and safe to show verbatim.
#[derive(Debug)]
pub enum SubscribeError {
    /// The URL could not be fetched, read, or parsed as a feed.
    UnusableFeed(String),
    /// The bot is missing configuration needed to finish the subscription.
    Misconfigured(String),
    /// Something broke on our side. Already logged; carries no detail.
    Internal,
}

impl fmt::Display for SubscribeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnusableFeed(message) | Self::Misconfigured(message) => f.write_str(message),
            Self::Internal => f.write_str(INTERNAL_ERROR_MESSAGE),
        }
    }
}

impl std::error::Error for SubscribeError {}

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
/// Every failure is logged here and returned as a generic, user-friendly
/// message — callers are free to show the error text to their audience.
pub async fn subscribe_feed(
    core: &CoreServices,
    url: &str,
    channel_id: ChannelId,
    guild_id: GuildId,
) -> Result<Subscription, SubscribeError> {
    let resp = core
        .reqwest_client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .inspect_err(|e| tracing::debug!(error = ?e, %url, "feed URL fetch failed"))
        .map_err(|_| {
            SubscribeError::UnusableFeed(
                "Could not fetch that URL. Make sure it points to a public RSS/Atom feed."
                    .to_string(),
            )
        })?;

    let body = resp
        .text()
        .await
        .inspect_err(|e| tracing::debug!(error = ?e, %url, "feed body read failed"))
        .map_err(|_| {
            SubscribeError::UnusableFeed("Could not read that feed's contents.".to_string())
        })?;

    let feed = feed_rs::parser::parse(body.as_bytes())
        .inspect_err(|e| tracing::debug!(error = ?e, %url, "feed parse failed"))
        .map_err(|_| {
            SubscribeError::UnusableFeed(
                "That URL does not look like a valid RSS or Atom feed.".to_string(),
            )
        })?;

    let feed_title = feed.title.map_or_else(|| "Feed".to_string(), |t| t.content);
    let kind = discover_feed_kind(url, &body);

    let feed_id = insert_feed(&core.db, url, &kind)
        .await
        .inspect_err(|e| tracing::error!(error = ?e, %url, "feed insert failed"))
        .map_err(|_| SubscribeError::Internal)?;

    let is_new = subscribe_channel(&core.db, feed_id, channel_id, guild_id)
        .await
        .inspect_err(|e| tracing::error!(error = ?e, %url, "channel subscription insert failed"))
        .map_err(|_| SubscribeError::Internal)?;

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
        let master_secret = core.config.internal_api_secret.as_deref().ok_or_else(|| {
            tracing::error!(
                fault = "INTERNAL_API_SECRET is not set",
                "WebSub callback signing unavailable"
            );
            SubscribeError::Misconfigured(
                "Missing internal API secret. Please ask the bot's administrator to fix this."
                    .to_string(),
            )
        })?;

        let callback_url = format!("{}/websub/{}", core.config.domain, feed_id);
        let secret = derive_feed_secret(master_secret, &feed_id);

        match request_hub_subscription(&core.reqwest_client, hub_url, topic, &callback_url, &secret)
            .await
        {
            Ok(()) => hub_confirmed = true,
            Err(e) => tracing::warn!(error = ?e, %feed_id, "WebSub hub subscription failed"),
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

#[cfg(test)]
mod tests {
    use super::{INTERNAL_ERROR_MESSAGE, SubscribeError};

    #[test]
    fn caller_faults_keep_their_explanation() {
        assert_eq!(
            SubscribeError::UnusableFeed(
                "That URL does not look like a valid RSS or Atom feed.".into()
            )
            .to_string(),
            "That URL does not look like a valid RSS or Atom feed."
        );
        assert_eq!(
            SubscribeError::Misconfigured("Missing internal API secret.".into()).to_string(),
            "Missing internal API secret."
        );
    }

    #[test]
    fn our_faults_never_leak_the_cause() {
        // `Internal` carries no payload, so there is nothing to leak by accident.
        assert_eq!(SubscribeError::Internal.to_string(), INTERNAL_ERROR_MESSAGE);
    }
}
