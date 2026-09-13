//! Domain types for social feed subscriptions.

use chrono::{DateTime, Utc};
use uuid::Uuid;

/// How a feed is delivered: push via hub or polled periodically.
pub enum FeedKind {
    /// Push feed via PubSubHubbub/`WebSub` hub.
    PubSubHubbub {
        /// Hub URL discovered from the feed or known overrides.
        hub_url: String,
        /// Topic URL the hub notifies about.
        topic: String,
        /// When the current hub lease expires, if known.
        lease_expires_at: Option<DateTime<Utc>>,
    },
    /// Plain RSS/Atom feed polled on an interval.
    Polling {
        /// Poll interval in seconds.
        interval_secs: u32,
        /// Last time the feed was polled.
        last_polled_at: Option<DateTime<Utc>>,
    },
}

/// A tracked feed row.
pub struct Feed {
    /// Feed primary key.
    pub id: Uuid,
    /// Canonical feed URL.
    pub url: String,
    /// Delivery mechanism.
    pub kind: FeedKind,
    /// When the feed was first tracked.
    pub created_at: DateTime<Utc>,
}