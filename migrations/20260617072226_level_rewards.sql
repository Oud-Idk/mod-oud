-- Add migration script here
CREATE TABLE IF NOT EXISTS level_rewards
(
    id                    BIGSERIAL PRIMARY KEY,
    guild_id              BIGINT NOT NULL,
    level_requirement     BIGINT NOT NULL,
    roles_to_add          BIGINT[],
    remove_previous_roles BOOLEAN DEFAULT FALSE,
    CONSTRAINT unique_guild_level UNIQUE (guild_id, level_requirement)
)
