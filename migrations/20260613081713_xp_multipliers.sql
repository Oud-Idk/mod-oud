CREATE TABLE IF NOT EXISTS xp_multipliers
(
    guild_id    VARCHAR(20),
    target_id   VARCHAR(20), -- Can be a Channel ID or Role ID
    target_type VARCHAR(10), -- 'channel' or 'role'
    multiplier  REAL,        -- e.g., 1.5, 2.0
    PRIMARY KEY (guild_id, target_id)
);