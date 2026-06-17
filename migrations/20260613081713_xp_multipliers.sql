CREATE TABLE IF NOT EXISTS xp_multipliers
(
    guild_id    VARCHAR(20) NOT NULL,
    target_id   VARCHAR(20) NOT NULL, -- Can be a Channel ID or Role ID
    target_type VARCHAR(10) NOT NULL, -- 'channel' or 'role'
    multiplier  REAL        NOT NULL, -- e.g., 1.5, 2.0
    PRIMARY KEY (guild_id, target_id)
);