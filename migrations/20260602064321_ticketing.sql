CREATE TYPE TICKET_STATUS AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE tickets
(
    id                     BIGSERIAL PRIMARY KEY,
    guild_id               BIGINT        NOT NULL,
    channel_id             BIGINT        NOT NULL UNIQUE,
    opener_id              BIGINT        NOT NULL,
    status                 TICKET_STATUS NOT NULL DEFAULT 'OPEN',
    created_at             TIMESTAMPTZ            DEFAULT NOW(),
    closed_at              TIMESTAMPTZ,
    last_activity          TIMESTAMPTZ            DEFAULT NOW(),
    message_count          INT                    DEFAULT 0,
    warned                 BOOLEAN                DEFAULT FALSE,
    last_button_message_id BIGINT
);

CREATE TABLE ticket_messages
(
    id                BIGSERIAL PRIMARY KEY,
    ticket_channel_id BIGINT NOT NULL REFERENCES tickets (channel_id) ON DELETE CASCADE,
    message_id        BIGINT NOT NULL UNIQUE,
    author_id         BIGINT NOT NULL,
    content           TEXT   NOT NULL,
    is_ticket_manager BOOL   NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);