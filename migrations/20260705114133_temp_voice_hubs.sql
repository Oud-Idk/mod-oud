CREATE TABLE IF NOT EXISTS temp_voice_hubs
(
    id                   UUID PRIMARY KEY         DEFAULT gen_random_uuid(),
    guild_id             VARCHAR(64)  NOT NULL,
    name                 VARCHAR(100) NOT NULL    DEFAULT 'Default Hub',
    default_channel_name TEXT         NOT NULL    DEFAULT '{user.display_name}''s Lounge',
    hub_channel_id       VARCHAR(64)  NOT NULL,
    category_id          VARCHAR(64)  NOT NULL,
    user_limit           INTEGER                  DEFAULT NULL,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    interface_channel_id VARCHAR(64),

    CONSTRAINT user_limit_limit CHECK (user_limit BETWEEN 0 AND 99)
);

-- Prevents assigning the same trigger channel to multiple configurations
CREATE UNIQUE INDEX IF NOT EXISTS idx_temp_voice_hubs_unique_channel
    ON temp_voice_hubs (guild_id, hub_channel_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_temp_voice_hubs_unique_category
    ON temp_voice_hubs (guild_id, category_id);

CREATE INDEX IF NOT EXISTS idx_temp_voice_hubs_guild ON temp_voice_hubs (guild_id);