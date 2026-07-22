CREATE TYPE LOG_ACTION AS ENUM ('JOIN', 'LEAVE');

CREATE TABLE join_leave_logs
(
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT     NOT NULL,
    guild_id   BIGINT     NOT NULL,
    action     LOG_ACTION NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);