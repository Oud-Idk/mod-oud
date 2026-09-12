-- Distinguish bot-issued actions from native Discord actions synced via audit log.
ALTER TABLE moderation_logs
    ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'BOT';
