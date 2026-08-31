-- Multiple randomized work messages (relational)
-- Each guild can have 0..N plaintext templates. Placeholders: {reward} {currency} {user}
-- Falls back to EconomyConfig.workMessage / default template when empty.
CREATE TABLE IF NOT EXISTS economy_work_messages (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id   BIGINT      NOT NULL,
    content    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_economy_work_messages_content_len CHECK (char_length(content) BETWEEN 1 AND 1000),
    CONSTRAINT chk_economy_work_messages_content_not_blank CHECK (char_length(trim(content)) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_economy_work_messages_guild ON economy_work_messages (guild_id);
