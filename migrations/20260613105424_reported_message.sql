CREATE TYPE report_status AS ENUM (
    'under_review',
    'actioned',
    'dismissed'
    );


CREATE TABLE reported_messages
(
    id              SERIAL PRIMARY KEY,

    -- Discord Snowflakes (stored as VARCHAR(20) to prevent JS integer truncation)
    guild_id        VARCHAR(20)   NOT NULL,
    channel_id      VARCHAR(20)   NOT NULL,
    message_id      VARCHAR(20)   NOT NULL,
    author_id       VARCHAR(20)   NOT NULL, -- The person who sent the bad message
    reporter_id     VARCHAR(20)   NOT NULL, -- The person who reported it

    -- States
    message_deleted BOOLEAN       NOT NULL   DEFAULT FALSE,
    user_warned     BOOLEAN       NOT NULL   DEFAULT FALSE,
    user_timed_out  BOOLEAN       NOT NULL   DEFAULT FALSE,
    user_banned     BOOLEAN       NOT NULL   DEFAULT FALSE,

    -- Friendly Names
    author_name     TEXT          NOT NULL,
    reporter_name   TEXT          NOT NULL,

    -- Evidence preservation
    content         TEXT          NOT NULL,
    attachment_url  TEXT,

    -- The reporter's reasoning
    reason          TEXT          NOT NULL,

    -- Moderation State
    status          report_status NOT NULL   DEFAULT 'under_review',
    moderator_id    VARCHAR(20),
    moderator_notes TEXT,

    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at     TIMESTAMP WITH TIME ZONE,

    -- Ensure a user can't report the exact same message multiple times
    -- and spam your dashboard database.
    CONSTRAINT unique_user_report_per_message UNIQUE (message_id, reporter_id)
);