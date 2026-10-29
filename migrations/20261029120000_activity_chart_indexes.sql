-- The overview charts read a 30-day window per guild. Without these, each load scans the
-- whole table.
CREATE INDEX IF NOT EXISTS idx_join_leave_logs_guild_created
    ON join_leave_logs (guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_logs_guild_created
    ON moderation_logs (guild_id, created_at DESC);
