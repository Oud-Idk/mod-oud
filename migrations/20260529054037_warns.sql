CREATE TABLE IF NOT EXISTS warns
(
    id             SERIAL PRIMARY KEY,
    guild_id       BIGINT      NOT NULL,

    moderator_id   BIGINT      NOT NULL,
    moderator_name VARCHAR(50) NOT NULL,

    user_id        BIGINT      NOT NULL,
    user_name      VARCHAR(50) NOT NULL,

    reason         VARCHAR(1000)            DEFAULT 'No reason provided',
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active      BOOLEAN                  DEFAULT TRUE
);