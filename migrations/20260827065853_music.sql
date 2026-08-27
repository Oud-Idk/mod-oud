CREATE TABLE IF NOT EXISTS music_play_events
(
    id          BIGSERIAL PRIMARY KEY,
    handle_uuid TEXT,
    guild_id    BIGINT      NOT NULL,
    user_id     BIGINT      NOT NULL,
    track_url   TEXT,
    title       TEXT        NOT NULL,
    artist      TEXT        NOT NULL,
    duration_ms BIGINT,
    listened_ms BIGINT,
    played_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_play_events_guild_time
    ON music_play_events (guild_id, played_at);

CREATE INDEX IF NOT EXISTS idx_music_play_events_guild_user_time
    ON music_play_events (guild_id, user_id, played_at);

CREATE INDEX IF NOT EXISTS idx_music_play_events_handle_uuid
    ON music_play_events (handle_uuid);
