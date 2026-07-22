CREATE TYPE RESTRICTION_TYPE AS ENUM ('NONE', 'ALL_EXCEPT', 'ONLY_THESE');

CREATE TABLE IF NOT EXISTS starboards
(
    id                       BIGSERIAL PRIMARY KEY,
    guild_id                 BIGINT                                              NOT NULL,
    starboard_channel_id     BIGINT                                              NOT NULL,
    emojis                   TEXT[]                   DEFAULT ARRAY ['⭐']::TEXT[],
    reaction_threshold       INT                      DEFAULT 3 CHECK (reaction_threshold > 0),
    min_message_age          INTERVAL                 DEFAULT NULL,
    max_message_age          INTERVAL                 DEFAULT NULL,
    prevent_self_star        BOOLEAN                  DEFAULT TRUE,
    allow_bot_messages       BOOLEAN                  DEFAULT FALSE,
    keep_deleted_messages    BOOLEAN                  DEFAULT FALSE,
    role_restriction_type    RESTRICTION_TYPE         DEFAULT 'NONE'             NOT NULL,
    restricted_roles         BIGINT[]                 DEFAULT ARRAY []::BIGINT[] NOT NULL,
    channel_restriction_type RESTRICTION_TYPE         DEFAULT 'NONE'             NOT NULL,
    restricted_channels      BIGINT[]                 DEFAULT ARRAY []::BIGINT[],
    created_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    embed_template           JSONB                    DEFAULT '{}',
    plaintext_template       TEXT                     DEFAULT ''
);

CREATE TABLE IF NOT EXISTS starred_messages
(
    original_message_id  BIGINT NOT NULL,
    starboard_message_id BIGINT UNIQUE,
    starboard_id         BIGINT NOT NULL REFERENCES starboards (id) ON DELETE CASCADE,
    guild_id             BIGINT NOT NULL,
    channel_id           BIGINT NOT NULL,
    author_id            BIGINT NOT NULL,
    star_count           INT                      DEFAULT 0 CHECK (star_count >= 0),
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Added the composite primary key at the bottom
    PRIMARY KEY (original_message_id, starboard_id)
);

-- Index for querying starred messages by guild quickly
CREATE INDEX IF NOT EXISTS idx_starred_messages_guild_id ON starred_messages (guild_id);