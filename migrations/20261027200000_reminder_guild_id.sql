-- Reminders were addressed by channel alone, so a stored row carried no tenant. The dashboard
-- authorised one guild and then read or edited rows by channel or row id, which let one guild's
-- manager touch another guild's reminders.
--
-- The backfill draws on every table that records both a guild and a channel, because any single
-- source covers only a subset and a missed row becomes invisible to the dashboard.
ALTER TABLE reminders
    ADD COLUMN IF NOT EXISTS guild_id BIGINT;

UPDATE reminders r
SET guild_id = src.guild_id
FROM (
    -- Each source is collapsed to one guild per channel; ambiguous channels resolve to nothing.
    SELECT channel_id, MIN(guild_id) AS guild_id
    FROM (
        SELECT channel_id, guild_id FROM media_only_channels
        UNION ALL SELECT channel_id, guild_id FROM giveaways WHERE channel_id IS NOT NULL
        UNION ALL SELECT channel_id, guild_id FROM reaction_messages
        UNION ALL SELECT channel_id, guild_id FROM tickets WHERE channel_id IS NOT NULL
        UNION ALL SELECT channel_id, guild_id FROM dynamic_slowmode_channels
        UNION ALL SELECT starboard_channel_id AS channel_id, guild_id FROM starboards
    ) AS sources
    GROUP BY channel_id
    HAVING COUNT(DISTINCT guild_id) = 1
) AS src
WHERE r.guild_id IS NULL
  AND r.channel_id = src.channel_id;

-- Rows no source could attribute are left active with a null guild: they still deliver, and an
-- operator can repair them, rather than being silently switched off by this migration.
CREATE INDEX IF NOT EXISTS idx_reminders_guild ON reminders (guild_id);