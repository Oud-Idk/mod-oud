ALTER TABLE custom_commands
    ADD COLUMN trigger_anywhere BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_custom_commands_anywhere
    ON custom_commands (guild_id) WHERE trigger_anywhere = TRUE AND enabled = TRUE;
