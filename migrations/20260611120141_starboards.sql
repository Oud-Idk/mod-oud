CREATE TABLE IF NOT EXISTS starboards
(
    id                       BIGSERIAL PRIMARY KEY, -- Primary Key
    guild_id                 VARCHAR(20) NOT NULL,  -- Not unique, multiple allowed
    starboard_channel_id     VARCHAR(20) NOT NULL,
    emojis                   TEXT[]                   DEFAULT ARRAY ['⭐']::TEXT[],
    reaction_threshold       INT                      DEFAULT 3 CHECK (reaction_threshold > 0),
    min_message_age          INTERVAL                 DEFAULT NULL,
    max_message_age          INTERVAL                 DEFAULT NULL,
    prevent_self_star        BOOLEAN                  DEFAULT TRUE,
    allow_bot_messages       BOOLEAN                  DEFAULT FALSE,
    keep_deleted_messages    BOOLEAN                  DEFAULT FALSE,
    role_restriction_type    VARCHAR(20)              DEFAULT 'none'
        CHECK (role_restriction_type IN ('none', 'all_except', 'only_these')),
    restricted_roles         VARCHAR(20)[]            DEFAULT ARRAY []::VARCHAR(20)[],
    channel_restriction_type VARCHAR(20)              DEFAULT 'none'
        CHECK (channel_restriction_type IN ('none', 'all_except', 'only_these')),
    restricted_channels      VARCHAR(20)[]            DEFAULT ARRAY []::VARCHAR(20)[],
    created_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    embed_template           JSONB                    DEFAULT '{}',
    plaintext_template       TEXT                     DEFAULT ''
);

CREATE TABLE IF NOT EXISTS starred_messages
(
    original_message_id  VARCHAR(20) NOT NULL, -- Removed 'PRIMARY KEY' here
    starboard_message_id VARCHAR(20) UNIQUE,
    starboard_id         BIGINT      NOT NULL REFERENCES starboards (id) ON DELETE CASCADE,
    guild_id             VARCHAR(20) NOT NULL,
    channel_id           VARCHAR(20) NOT NULL,
    author_id            VARCHAR(20) NOT NULL,
    star_count           INT                      DEFAULT 0 CHECK (star_count >= 0),
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Added the composite primary key at the bottom
    PRIMARY KEY (original_message_id, starboard_id)
);

-- Index for querying starred messages by guild quickly
CREATE INDEX IF NOT EXISTS idx_starred_messages_guild_id ON starred_messages (guild_id);