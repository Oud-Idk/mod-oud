-- Add migration script here
CREATE TABLE IF NOT EXISTS level_rewards
(
    id                    SERIAL PRIMARY KEY,
    guild_id              VARCHAR(20) NOT NULL,
    level_requirement     INT         NOT NULL,
    roles_to_add          VARCHAR(20)[],
    remove_previous_roles BOOLEAN DEFAULT FALSE,
    CONSTRAINT unique_guild_level UNIQUE (guild_id, level_requirement)
)