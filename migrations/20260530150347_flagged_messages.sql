CREATE TABLE flagged_messages (
    id BIGSERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    message_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    flag_type VARCHAR(50) NOT NULL, -- e.g. "SEVERE"
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);