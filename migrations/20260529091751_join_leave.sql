CREATE TABLE join_leave_logs (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    guild_id BIGINT NOT NULL,
    action VARCHAR(10) NOT NULL, -- 'JOIN' or 'LEAVE'
    created_at TIMESTAMPTZ DEFAULT NOW()
);