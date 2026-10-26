-- The tick discovers guilds with the policy on every pass. `settings` blobs are large, so the
-- lookup needs an index rather than a sequential scan. Partial, because only enabled guilds are
-- ever read and that keeps the index proportional to them.
CREATE INDEX IF NOT EXISTS idx_guild_configs_slowmode_enabled
    ON guild_configs ((settings -> 'dynamic_slowmode' ->> 'enabled'))
    WHERE settings -> 'dynamic_slowmode' ->> 'enabled' = 'true';