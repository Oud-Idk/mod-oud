CREATE TYPE TARGET_TYPE AS ENUM ('CHANNEL', 'ROLE');

CREATE TABLE IF NOT EXISTS xp_multipliers
(
    guild_id    BIGINT      NOT NULL,
    target_id   BIGINT      NOT NULL,
    target_type VARCHAR(10) NOT NULL,
    multiplier  REAL        NOT NULL,
    PRIMARY KEY (guild_id, target_id)
);