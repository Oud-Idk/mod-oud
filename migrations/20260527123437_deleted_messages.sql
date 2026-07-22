CREATE TABLE IF NOT EXISTS deleted_messages
(
    id             BIGSERIAL PRIMARY KEY,
    message_id     BIGINT NOT NULL,
    author_id      BIGINT NOT NULL,
    channel_id     BIGINT NOT NULL,
    guild_id       BIGINT NOT NULL,
    content        TEXT   NOT NULL,
    attachment_url TEXT,
    deleted_by_id  BIGINT,
    deleted_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);