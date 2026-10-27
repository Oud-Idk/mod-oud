-- Reminders are read by one worker for every guild, so a single row that can never be sent
-- must not be able to occupy the batch forever.

-- A zero or negative channel ID panics Serenity's ChannelId::new, which took the worker down.
-- Existing rows of that shape would make the constraint below fail and stop the deploy, so they
-- are dropped first: an ID that cannot be a channel has no delivery target to preserve.
DELETE FROM reminders WHERE channel_id <= 0;

ALTER TABLE reminders
    ADD CONSTRAINT chk_reminders_channel_id_positive CHECK (channel_id > 0);

-- Send attempts are counted so a failing row can be seen in the data. Nothing acts on it yet:
-- parking or deactivating a row after N failures needs a policy decision. The deferral in the
-- worker is what actually stops a failing row crowding the queue.
ALTER TABLE reminders
    ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0;