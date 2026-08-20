CREATE TABLE IF NOT EXISTS levels
(
    guild_id      BIGINT NOT NULL,
    user_id       BIGINT NOT NULL,

    cumulative_xp BIGINT NOT NULL DEFAULT 0,
    current_level BIGINT NOT NULL DEFAULT 0,
    current_xp    BIGINT NOT NULL DEFAULT 0,

    PRIMARY KEY (guild_id, user_id)
)
