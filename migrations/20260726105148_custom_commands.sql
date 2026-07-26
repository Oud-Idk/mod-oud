CREATE TYPE command_cooldown_type AS ENUM ('NONE', 'USER', 'SERVER');

CREATE TABLE custom_commands
(
    id               BIGSERIAL PRIMARY KEY,
    guild_id         BIGINT                                  NOT NULL,
    name             TEXT                                    NOT NULL, -- Command trigger (e.g. "rules")
    description      TEXT                     DEFAULT '',
    enabled          BOOLEAN                  DEFAULT TRUE   NOT NULL,
    delete_trigger   BOOLEAN                  DEFAULT FALSE  NOT NULL, -- Auto-delete user's message
    cooldown_type    command_cooldown_type    DEFAULT 'NONE' NOT NULL,
    cooldown_seconds INTEGER                  DEFAULT 0      NOT NULL,

    -- Permissions & Filtering
    allowed_roles    BIGINT[]                 DEFAULT '{}'   NOT NULL,
    ignored_roles    BIGINT[]                 DEFAULT '{}'   NOT NULL,
    allowed_channels BIGINT[]                 DEFAULT '{}'   NOT NULL,
    ignored_channels BIGINT[]                 DEFAULT '{}'   NOT NULL,

    -- Array of Action objects stored as JSONB
    actions          JSONB                                   NOT NULL DEFAULT '[]',

    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()  NOT NULL,

    -- Ensure command names are unique per guild
    CONSTRAINT unique_command_per_guild UNIQUE (guild_id, name)
);

CREATE INDEX idx_custom_commands_guild ON custom_commands (guild_id, name);