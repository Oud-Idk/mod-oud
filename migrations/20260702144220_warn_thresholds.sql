CREATE TYPE MODERATION_ACTION AS ENUM ('timeout', 'kick', 'ban', 'role_remove', 'role_add', 'role_remove_all');

CREATE TABLE warn_thresholds
(
    id              BIGSERIAL PRIMARY KEY,
    guild_id        BIGINT              NOT NULL,
    warn_count      INT                 NOT NULL,
    action_type     MODERATION_ACTION[] NOT NULL,
    roles_to_add    BIGINT[],
    roles_to_remove BIGINT[],
    duration        INT DEFAULT NULL,

    -- Ensure a server doesn't have two conflicting rules for the same warning count
    CONSTRAINT unique_guild_threshold UNIQUE (guild_id, warn_count)
);

CREATE INDEX idx_thresholds_guild ON warn_thresholds (guild_id);