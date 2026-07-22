-- Create the automod logs table
CREATE TABLE IF NOT EXISTS automod_logs
(
    id               BIGSERIAL PRIMARY KEY,
    guild_id         BIGINT                                             NOT NULL,
    user_id          BIGINT                                             NOT NULL,
    channel_id       BIGINT,
    message_id       BIGINT,

    rule_type        VARCHAR(50)                                        NOT NULL,

    -- The specific word, pattern, or link that triggered the filter (can be null for things like zalgo)
    trigger_content  TEXT,

    -- The raw text of the message for moderators to review context
    original_content TEXT,

    -- Array of executed actions, e.g., {'delete', 'warn'}
    actions_taken    VARCHAR(50)[]                                      NOT NULL,

    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Index for the main dashboard view
CREATE INDEX IF NOT EXISTS idx_automod_logs_guild_created
    ON automod_logs (guild_id, created_at DESC);

-- Index for searching a specific user's infraction history inside a guild
CREATE INDEX IF NOT EXISTS idx_automod_logs_guild_user
    ON automod_logs (guild_id, user_id);