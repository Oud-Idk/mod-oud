use crate::features::social_notifications::types::{Feed, FeedKind};
use chrono::{DateTime, Utc};
use serenity::all::{ChannelId, GuildId};
use sqlx::{Error, FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow)]
pub struct RawFeedRow {
    pub id: Uuid,
    pub url: String,
    pub feed_type: String,
    pub hub_url: Option<String>,
    pub topic: Option<String>,
    pub lease_expires_at: Option<DateTime<Utc>>,
    pub interval_secs: Option<i32>,
    pub last_polled_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl TryFrom<RawFeedRow> for Feed {
    type Error = &'static str;

    fn try_from(row: RawFeedRow) -> Result<Self, Self::Error> {
        let kind = match row.feed_type.as_str() {
            "PUBSUBHUBBUB" => FeedKind::PubSubHubbub {
                hub_url: row.hub_url.ok_or("Missing hub_url for PUBSUBHUBBUB")?,
                topic: row.topic.ok_or("Missing topic for PUBSUBHUBBUB")?,
                lease_expires_at: row.lease_expires_at,
            },
            "POLLING" => FeedKind::Polling {
                interval_secs: row.interval_secs.unwrap_or(600).max(60).cast_unsigned(),
                last_polled_at: row.last_polled_at,
            },
            _ => return Err("Unknown feed_type in database"),
        };

        Ok(Feed {
            id: row.id,
            url: row.url,
            kind,
            created_at: row.created_at,
        })
    }
}

pub async fn insert_feed(db: &PgPool, url: &str, kind: &FeedKind) -> sqlx::Result<Uuid> {
    let (
        feed_type_str,
        hub_url,
        topic,
        lease_expires_at,
        interval_secs,
        last_polled_at,
    ) = match kind {
        FeedKind::PubSubHubbub {
            hub_url,
            topic,
            lease_expires_at,
        } => (
            "PUBSUBHUBBUB",
            Some(hub_url),
            Some(topic),
            lease_expires_at.as_ref(),
            None,
            None,
        ),
        FeedKind::Polling {
            interval_secs,
            last_polled_at,
        } => (
            "POLLING",
            None,
            None,
            None,
            Some((*interval_secs).cast_signed()),
            last_polled_at.as_ref(),
        ),
    };

    let feed_id = sqlx::query_scalar!(
        r#"
        INSERT INTO feeds (
            url,
            feed_type,
            hub_url,
            topic,
            lease_expires_at,
            interval_secs,
            last_polled_at
        )
        VALUES ($1, $2::feed_type, $3, $4, $5, $6, $7)
        ON CONFLICT (url) DO UPDATE SET
            feed_type = EXCLUDED.feed_type,
            hub_url = EXCLUDED.hub_url,
            topic = EXCLUDED.topic,
            interval_secs = EXCLUDED.interval_secs
        RETURNING id
        "#,
        url,
        feed_type_str as _,
        hub_url,
        topic,
        lease_expires_at,
        interval_secs,
        last_polled_at
    )
        .fetch_one(db)
        .await?;

    Ok(feed_id)
}

/// Subscribes a channel to a feed.
/// Returns `true` if a new subscription was created, or `false` if it was already subscribed.
pub async fn subscribe_channel(
    db: &PgPool,
    feed_id: Uuid,
    channel_id: ChannelId,
    guild_id: GuildId,
) -> sqlx::Result<bool> {
    let inserted = sqlx::query_scalar!(
        r#"
        INSERT INTO channel_subscriptions (feed_id, channel_id, guild_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (feed_id, channel_id) DO NOTHING
        RETURNING feed_id
        "#,
        feed_id,
        channel_id.get().cast_signed(),
        guild_id.get().cast_signed(),
    )
        .fetch_optional(db)
        .await?;

    Ok(inserted.is_some())
}

/// Fetches all Discord channel IDs subscribed to a given feed.
pub async fn get_subscribed_channels(
    db: &PgPool,
    feed_id: Uuid,
) -> sqlx::Result<Vec<ChannelId>> {
    let rows = sqlx::query_scalar!(
        r#"
        SELECT channel_id
        FROM channel_subscriptions
        WHERE feed_id = $1
        "#,
        feed_id
    )
        .fetch_all(db)
        .await?;

    let channels = rows
        .into_iter()
        .map(|id| ChannelId::new(id.cast_unsigned()))
        .collect();

    Ok(channels)
}

pub async fn check_if_feed_exists(feed_id: Uuid, db: &PgPool) -> Result<Option<bool>, Error> {
    sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM feeds WHERE id = $1)",
        feed_id
    )
        .fetch_one(db)
        .await
}

#[derive(FromRow)]
pub struct DueFeedRow {
    pub id: Uuid,
    pub url: String,
    pub last_polled_at: Option<DateTime<Utc>>,
}

pub async fn fetch_due_feeds(db: &PgPool) -> sqlx::Result<Vec<DueFeedRow>> {
    sqlx::query_as!(
        DueFeedRow,
        r#"
        SELECT id, url, last_polled_at
        FROM feeds
        WHERE feed_type = 'POLLING'
          AND (
            last_polled_at IS NULL
            OR last_polled_at < NOW() - (interval_secs * INTERVAL '1 second')
          )
        ORDER BY last_polled_at NULLS FIRST
        LIMIT 10
        "#
    )
        .fetch_all(db)
        .await
}

pub async fn mark_feed_polled(db: &PgPool, feed_id: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "UPDATE feeds SET last_polled_at = NOW() WHERE id = $1",
        feed_id
    )
        .execute(db)
        .await?;
    Ok(())
}

pub async fn insert_seen_entry(
    db: &PgPool,
    feed_id: Uuid,
    entry_id: &str,
) -> sqlx::Result<Option<Uuid>> {
    sqlx::query_scalar!(
        r#"
        INSERT INTO seen_entries (feed_id, entry_id)
        VALUES ($1, $2)
        ON CONFLICT (feed_id, entry_id) DO NOTHING
        RETURNING feed_id
        "#,
        feed_id,
        entry_id
    )
        .fetch_optional(db)
        .await
}

#[derive(FromRow)]
pub struct ExpiringFeedRow {
    pub id: Uuid,
    pub hub_url: Option<String>,
    pub topic: Option<String>,
}

pub async fn fetch_expiring_feeds(db: &PgPool) -> sqlx::Result<Vec<ExpiringFeedRow>> {
    sqlx::query_as!(
        ExpiringFeedRow,
        r#"
        SELECT id, hub_url, topic
        FROM feeds
        WHERE feed_type = 'PUBSUBHUBBUB'
          AND hub_url IS NOT NULL
          AND topic IS NOT NULL
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at < NOW() + INTERVAL '24 hours'
        LIMIT 5
        "#
    )
        .fetch_all(db)
        .await
}

pub async fn update_lease(
    db: &PgPool,
    feed_id: Uuid,
    expires_at: DateTime<Utc>,
) -> sqlx::Result<()> {
    sqlx::query!(
        r#"
        UPDATE feeds
        SET lease_expires_at = $1
        WHERE id = $2
        "#,
        expires_at,
        feed_id
    )
        .execute(db)
        .await?;
    Ok(())
}