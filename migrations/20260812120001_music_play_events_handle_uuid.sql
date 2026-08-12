ALTER TABLE music_play_events
    ADD COLUMN IF NOT EXISTS handle_uuid TEXT;

CREATE INDEX IF NOT EXISTS idx_music_play_events_handle_uuid
    ON music_play_events (handle_uuid);
