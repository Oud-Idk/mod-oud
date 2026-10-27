-- Reminders are read by one worker for every guild, so a single row that can never be sent
-- must not be able to occupy the batch forever.

-- A zero or negative channel ID panics Serenity's ChannelId::new, which took the worker down.
ALTER TABLE reminders
    ADD CONSTRAINT chk_reminders_channel_id_positive CHECK (channel_id > 0);

-- Send attempts are counted so a permanently failing row can be parked instead of retried
-- ahead of every other guild's due reminders.
ALTER TABLE reminders
    ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0;

-- The worker filters on this, so it needs to be part of the due index.
DROP INDEX IF EXISTS idx_reminders_due;
CREATE INDEX IF NOT EXISTS idx_reminders_due
    ON reminders (next_trigger_at)
    WHERE is_active = TRUE;