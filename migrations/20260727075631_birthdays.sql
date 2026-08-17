-- 2. User Birthdays Table (Global)
CREATE TABLE IF NOT EXISTS user_birthdays
(
    user_id     BIGINT PRIMARY KEY,
    birth_month SMALLINT    NOT NULL CHECK (birth_month BETWEEN 1 AND 12),
    birth_day   SMALLINT    NOT NULL CHECK (birth_day BETWEEN 1 AND 31),
    birth_year  INT                  DEFAULT NULL CHECK (birth_year IS NULL OR (birth_year BETWEEN 1920 AND 2100)),
    timezone    VARCHAR(64)          DEFAULT 'UTC',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast daily birthday queries ⚡
CREATE INDEX IF NOT EXISTS idx_user_birthdays_month_day
    ON user_birthdays (birth_month, birth_day);

-- 3. Active Birthday Roles Tracking Table
CREATE TABLE IF NOT EXISTS active_birthday_roles
(
    guild_id    BIGINT      NOT NULL,
    user_id     BIGINT      NOT NULL,
    role_id     BIGINT      NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (guild_id, user_id)
);

-- Index for fast expiration cleanup jobs 🧹
CREATE INDEX IF NOT EXISTS idx_active_birthday_roles_expires
    ON active_birthday_roles (expires_at);

-- 4. Timestamp Update Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS
$$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER update_user_birthdays_updated_at
    BEFORE UPDATE
    ON user_birthdays
    FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 5. Sent Messages / Birthday Logs Table
CREATE TABLE IF NOT EXISTS birthday_logs
(
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    guild_id   BIGINT      NOT NULL,
    user_id    BIGINT      NOT NULL,
    year_sent  INT         NOT NULL,              -- e.g. 2026
    channel_id BIGINT      NOT NULL,
    message_id BIGINT               DEFAULT NULL, -- Useful if you want to delete/edit it later
    sent_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Guarantees a member only receives ONE announcement per guild per year!
    CONSTRAINT unique_guild_user_year UNIQUE (guild_id, user_id, year_sent)
);

-- Index for quick lookups during cron runs
CREATE INDEX IF NOT EXISTS idx_birthday_logs_lookup
    ON birthday_logs (guild_id, user_id, year_sent);
