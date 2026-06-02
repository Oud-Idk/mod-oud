CREATE TABLE scam_messages
(
    id         BIGSERIAL PRIMARY KEY,
    guild_id   BIGINT      NOT NULL,
    channel_id BIGINT      NOT NULL,
    message_id BIGINT      NOT NULL,
    author_id  BIGINT      NOT NULL,
    content    TEXT        NOT NULL,
    flag_type  INTEGER[]   NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index to optimize querying a specific user's spam history in a server
CREATE INDEX idx_scam_messages_guild_author ON scam_messages (guild_id, author_id);