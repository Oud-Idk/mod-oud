CREATE TYPE REMINDER_TYPE AS ENUM ('SINGLE', 'RECURRING');

CREATE TABLE reminders
(
    id               BIGSERIAL PRIMARY KEY,
    channel_id       BIGINT                   NOT NULL,
    message          JSONB                    NOT NULL DEFAULT '{
      "format": "TEXT",
      "content": "",
      "embed": {}
    }'::JSONB,

    r_type           REMINDER_TYPE            NOT NULL DEFAULT 'SINGLE',

    -- Used for both single reminders and the "next run" of recurring ones
    next_trigger_at  TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Recurrence Rules (Null if r_type is 'single')
    days_of_week     INT[], -- e.g., '{3, 5}' for Wednesday and Friday
    time_start       TIME,  -- for recurring
    time_end         TIME,  -- also for recurring
    interval_seconds INT,
    timezone         TEXT                              DEFAULT 'UTC',

    is_active        BOOLEAN                           DEFAULT TRUE
);

CREATE INDEX idx_reminders_due ON reminders (next_trigger_at) WHERE is_active = TRUE;
