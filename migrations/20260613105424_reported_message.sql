CREATE TYPE REPORT_STATUS AS ENUM (
    'UNDER_REVIEW',
    'ACTIONED',
    'DISMISSED'
    );


CREATE TABLE reported_messages
(
    id              BIGSERIAL PRIMARY KEY,

    guild_id        BIGINT        NOT NULL,
    channel_id      BIGINT        NOT NULL,
    message_id      BIGINT        NOT NULL,
    author_id       BIGINT        NOT NULL, -- The person who sent the bad message
    reporter_id     BIGINT        NOT NULL, -- The person who reported it

    -- States
    message_deleted BOOLEAN       NOT NULL   DEFAULT FALSE,
    user_warned     BOOLEAN       NOT NULL   DEFAULT FALSE,
    user_timed_out  BOOLEAN       NOT NULL   DEFAULT FALSE,
    user_banned     BOOLEAN       NOT NULL   DEFAULT FALSE,

    -- Evidence preservation
    content         TEXT          NOT NULL,
    attachment_url  TEXT,

    -- The reporter's reasoning
    reason          TEXT          NOT NULL,

    -- Moderation State
    status          REPORT_STATUS NOT NULL   DEFAULT 'UNDER_REVIEW',
    moderator_id    VARCHAR(20),
    moderator_notes TEXT,

    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at     TIMESTAMP WITH TIME ZONE,

    -- Ensure a user can't report the exact same message multiple times
    -- and spam your dashboard database.
    CONSTRAINT unique_user_report_per_message UNIQUE (message_id, reporter_id)
);