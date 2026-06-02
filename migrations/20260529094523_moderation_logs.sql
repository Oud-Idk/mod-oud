CREATE TABLE moderation_logs (
    case_id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    target_id BIGINT NOT NULL,
    moderator_id BIGINT NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'kick', 'ban', 'mute', 'unmute', 'softban', 'purge'
    reason TEXT,
    duration VARCHAR(50),             -- Stores the user-inputted duration string, if applicable
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
