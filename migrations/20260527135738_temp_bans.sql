CREATE TABLE IF NOT EXISTS temp_bans (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    unban_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_temp_bans_unban_at ON temp_bans (unban_at);
