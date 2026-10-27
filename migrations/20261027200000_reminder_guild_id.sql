-- Reminders were addressed by channel alone, so a stored row carried no tenant. The dashboard
-- authorised one guild and then read or edited rows by channel or row id, which let one guild's
-- manager touch another guild's reminders.
--
-- Existing rows are backfilled only where another table that does record a guild agrees on the
-- channel. Anything left null is a row we cannot safely attribute, so it is deactivated rather
-- than guessed at: an inactive row is silently ignored by the worker, whereas a null-guild row
-- would simply stop appearing in the dashboard with no signal.
ALTER TABLE reminders
    ADD COLUMN IF NOT EXISTS guild_id BIGINT;

UPDATE reminders r
SET guild_id = m.guild_id
FROM media_only_channels m
WHERE r.guild_id IS NULL
  AND m.channel_id = r.channel_id;

UPDATE reminders
SET is_active = FALSE
WHERE guild_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_reminders_guild ON reminders (guild_id);