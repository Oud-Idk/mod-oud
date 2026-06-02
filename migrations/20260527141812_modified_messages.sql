CREATE TABLE IF NOT EXISTS modified_messages (
    id SERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    channel_id BIGINT NOT NULL,
    guild_id BIGINT NOT NULL,
    old_content TEXT,
    new_content TEXT,
    edited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);