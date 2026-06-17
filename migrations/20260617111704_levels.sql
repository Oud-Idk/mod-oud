CREATE TABLE IF NOT EXISTS levels
(
    guild_id      VARCHAR(20) NOT NULL,
    user_id       VARCHAR(20) NOT NULL,

    cumulative_xp INT         NOT NULL DEFAULT 0,
    current_level INT         NOT NULL DEFAULT 0,
    current_xp    INT         NOT NULL DEFAULT 0,

    PRIMARY KEY (guild_id, user_id)
)