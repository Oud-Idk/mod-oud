CREATE TABLE spammed_messages (
    id BIGSERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    message_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index to optimize querying a specific user's spam history in a server
CREATE INDEX idx_spammed_messages_guild_author ON spammed_messages (guild_id, author_id);