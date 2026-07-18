CREATE TABLE moderation_logs
(
    case_id            BIGSERIAL PRIMARY KEY,
    guild_id           BIGINT      NOT NULL,
    target_id          BIGINT,
    target_username    VARCHAR(50),

    moderator_id       BIGINT      NOT NULL,
    moderator_username VARCHAR(50) NOT NULL,

    action_type        VARCHAR(50) NOT NULL,
    reason             TEXT,
    duration           INTERVAL,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
