CREATE TABLE IF NOT EXISTS giveaways
(
    id           BIGSERIAL PRIMARY KEY,

    guild_id     BIGINT         NOT NULL,
    host_id      BIGINT         NOT NULL,
    channel_id   BIGINT,
    message_id   BIGINT,

    prize        TEXT           NOT NULL,
    winner_count INT            NOT NULL DEFAULT 1,
    end_time     TIMESTAMPTZ    NOT NULL,
    is_finished  BOOLEAN        NOT NULL DEFAULT FALSE,

    format       message_format NOT NULL,
    embed        JSONB,
    content      TEXT
);

CREATE INDEX IF NOT EXISTS idx_giveaways_pending
    ON giveaways (end_time)
    WHERE is_finished = FALSE;