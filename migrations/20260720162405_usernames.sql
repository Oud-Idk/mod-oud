CREATE TABLE discord_users
(
    user_id    BIGINT PRIMARY KEY,
    username   VARCHAR(32) NOT NULL,
    avatar_url TEXT,
    updated_at TIMESTAMP   NOT NULL DEFAULT NOW()
);