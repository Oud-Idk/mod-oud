CREATE TYPE raid_event_type AS ENUM ('TRIGGERED', 'RESOLVED', 'ACTION_APPLIED');

CREATE TABLE raid_active_state
(
    guild_id          BIGINT PRIMARY KEY,
    raid_start_time   TIMESTAMPTZ NOT NULL,
    pre_raid_snapshot JSONB       NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE raid_hourly_stats
(
    guild_id   BIGINT NOT NULL,
    hour_key   TEXT   NOT NULL,
    join_count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, hour_key)
);

CREATE TABLE raid_event_logs
(
    id         BIGSERIAL PRIMARY KEY,
    guild_id   BIGINT          NOT NULL,
    event_type raid_event_type NOT NULL,
    details    JSONB,
    created_at TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_raid_event_logs_guild_id ON raid_event_logs (guild_id);
CREATE INDEX idx_raid_event_logs_created_at ON raid_event_logs (created_at);
CREATE INDEX idx_raid_hourly_stats_guild_id ON raid_hourly_stats (guild_id);
