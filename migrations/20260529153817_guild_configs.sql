CREATE TYPE flag_severity AS ENUM ('MILD', 'MODERATE', 'SEVERE');

CREATE TABLE IF NOT EXISTS guild_configs (
    guild_id BIGINT PRIMARY KEY,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_guild_configs_settings ON guild_configs USING gin (settings);