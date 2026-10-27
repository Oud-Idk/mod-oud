-- Reminders were addressed by channel alone, so a stored row carried no tenant. The dashboard
-- authorised one guild and then read or edited rows by channel or row id, which let one guild's
-- manager touch another guild's reminders.
--
-- Existing rows are backfilled only where the channel appears in another table that does record a
-- guild; anything left null is treated as unusable rather than guessed at.
ALTER TABLE reminders
    ADD COLUMN IF NOT EXISTS guild_id BIGINT;

UPDATE reminders r
SET guild_id = m.guild_id
FROM media_only_channels m
WHERE r.guild_id IS NULL
  AND m.channel_id = r.channel_id;

CREATE INDEX IF NOT EXISTS idx_reminders_guild ON reminders (guild_id);