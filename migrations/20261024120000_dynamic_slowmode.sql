CREATE TABLE IF NOT EXISTS dynamic_slowmode_channels
(
    channel_id          BIGINT PRIMARY KEY,
    guild_id            BIGINT      NOT NULL,
    pre_automation_secs SMALLINT    NOT NULL,
    last_written_secs   SMALLINT    NOT NULL,
    last_edit_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    armed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disarmed_at         TIMESTAMPTZ,
    disarm_reason       TEXT
);

CREATE INDEX IF NOT EXISTS idx_dynamic_slowmode_channels_guild_id
    ON dynamic_slowmode_channels (guild_id);
