CREATE TYPE ticket_status AS ENUM ('OPEN', 'CLOSE');

CREATE TABLE tickets
(
    id         SERIAL PRIMARY KEY,
    guild_id   BIGINT        NOT NULL,
    channel_id BIGINT        NOT NULL UNIQUE,
    opener_id  BIGINT        NOT NULL,
    status     ticket_status NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ            DEFAULT NOW(),
    closed_at  TIMESTAMPTZ
);

CREATE TABLE ticket_messages
(
    id                SERIAL PRIMARY KEY,
    ticket_channel_id BIGINT NOT NULL REFERENCES tickets (channel_id) ON DELETE CASCADE,
    message_id        BIGINT NOT NULL UNIQUE,
    author_id         BIGINT NOT NULL,
    content           TEXT   NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);