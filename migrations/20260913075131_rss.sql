CREATE TYPE FEED_TYPE AS ENUM ('PUBSUBHUBBUB', 'POLLING');

CREATE TABLE IF NOT EXISTS feeds
(
    id               UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    url              TEXT        NOT NULL UNIQUE,
    feed_type        FEED_TYPE   NOT NULL,

    -- if PUBSUBHUBBUB
    hub_url          TEXT,
    topic            TEXT,
    lease_expires_at TIMESTAMPTZ,

    -- if POLLING
    interval_secs    INT                  DEFAULT 600,
    last_polled_at   TIMESTAMPTZ,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_feed_kind CHECK (
        (feed_type = 'PUBSUBHUBBUB' AND hub_url IS NOT NULL AND topic IS NOT NULL AND
         interval_secs IS NULL)
            OR
        (feed_type = 'POLLING' AND interval_secs IS NOT NULL AND hub_url IS NULL AND topic IS NULL)
        )
);

CREATE TABLE IF NOT EXISTS channel_subscriptions
(
    feed_id    UUID        NOT NULL REFERENCES feeds (id) ON DELETE CASCADE,
    channel_id BIGINT      NOT NULL,
    guild_id   BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (feed_id, channel_id)
);

CREATE TABLE IF NOT EXISTS seen_entries
(
    feed_id  UUID        NOT NULL REFERENCES feeds (id) ON DELETE CASCADE,
    entry_id TEXT        NOT NULL,
    seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (feed_id, entry_id)
);

-- INDEXES
CREATE INDEX idx_feeds_websub_renewal
    ON feeds (lease_expires_at)
    WHERE feed_type = 'PUBSUBHUBBUB';

CREATE INDEX idx_feeds_polling_queue
    ON feeds (last_polled_at)
    WHERE feed_type = 'POLLING';

CREATE INDEX idx_subscriptions_channel
    ON channel_subscriptions (channel_id);

CREATE INDEX idx_seen_entries_cleanup
    ON seen_entries (seen_at);