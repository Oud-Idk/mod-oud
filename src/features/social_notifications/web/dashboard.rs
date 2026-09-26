//! Dashboard-facing feed management, mounted under `/api` behind the internal secret.

use crate::core::config::state::WebState;
use crate::features::social_notifications::subscription::subscribe_feed;
use crate::features::social_notifications::types::FeedKind;
use axum::Json;
use axum::extract::{Path, State};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serenity::all::{Channel, ChannelId, GuildId};
use std::sync::Arc;
use tracing::{debug, error, warn};
use uuid::Uuid;

/// How the dashboard should present a feed's delivery mechanism.
#[derive(Debug, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FeedDelivery {
    /// Pushed by a `WebSub` hub.
    PubSubHubbub,
    /// Polled on an interval by the bot.
    Polling,
}

/// Dashboard payload for creating a feed subscription.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeFeedPayload {
    /// RSS/Atom feed URL to subscribe to.
    pub url: String,
    /// Discord channel (as a snowflake string) that receives new posts.
    pub channel_id: String,
}

/// Dashboard response describing a created (or already existing) subscription.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeFeedResponse {
    /// Feed row backing the subscription.
    pub feed_id: Uuid,
    /// Feed title, falling back to `"Feed"`.
    pub feed_title: String,
    /// Whether the channel was already subscribed to this feed.
    pub already_subscribed: bool,
    /// Delivery mechanism for the feed.
    pub delivery: FeedDelivery,
    /// Whether the `WebSub` hub accepted the subscription request.
    pub hub_confirmed: bool,
    /// Poll interval in seconds, for polled feeds only.
    pub interval_secs: Option<u32>,
}

/// Creates a feed subscription on behalf of the dashboard.
///
/// Feed fetching, hub discovery, and the `WebSub` handshake all live in the bot,
/// so the dashboard hands the URL off here instead of duplicating that logic.
pub async fn create_feed_subscription(
    State(state): State<Arc<WebState>>,
    Path(guild_id): Path<GuildId>,
    Json(payload): Json<SubscribeFeedPayload>,
) -> Result<(StatusCode, Json<SubscribeFeedResponse>), (StatusCode, String)> {
    let url = payload.url.trim();
    if url.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Feed URL is required".to_string()));
    }

    let channel_id = payload
        .channel_id
        .parse::<u64>()
        .map(ChannelId::new)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid channel ID".to_string()))?;

    ensure_channel_in_guild(&state, guild_id, channel_id).await?;

    let subscription = subscribe_feed(&state.core, url, channel_id, guild_id)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let (delivery, interval_secs) = match subscription.kind {
        FeedKind::PubSubHubbub { .. } => (FeedDelivery::PubSubHubbub, None),
        FeedKind::Polling { interval_secs, .. } => (FeedDelivery::Polling, Some(interval_secs)),
    };

    debug!(
        %guild_id,
        %channel_id,
        feed_id = %subscription.feed_id,
        already_subscribed = subscription.already_subscribed,
        "Dashboard feed subscription created"
    );

    Ok((
        StatusCode::OK,
        Json(SubscribeFeedResponse {
            feed_id: subscription.feed_id,
            feed_title: subscription.feed_title,
            already_subscribed: subscription.already_subscribed,
            delivery,
            hub_confirmed: subscription.hub_confirmed,
            interval_secs,
        }),
    ))
}

/// Rejects channels that do not live in the requesting guild.
async fn ensure_channel_in_guild(
    state: &Arc<WebState>,
    guild_id: GuildId,
    channel_id: ChannelId,
) -> Result<(), (StatusCode, String)> {
    match state.serenity_http.get_channel(channel_id).await {
        Ok(Channel::Guild(channel)) if channel.guild_id == guild_id => Ok(()),
        Ok(_) => {
            warn!(%guild_id, %channel_id, "Channel does not belong to this guild");
            Err((
                StatusCode::BAD_REQUEST,
                "That channel does not belong to this server".to_string(),
            ))
        }
        Err(e) => {
            error!(error = ?e, %guild_id, %channel_id, "Failed to resolve channel");
            Err((
                StatusCode::BAD_REQUEST,
                "Could not find that channel in this server".to_string(),
            ))
        }
    }
}
