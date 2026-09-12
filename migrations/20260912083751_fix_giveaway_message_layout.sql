UPDATE giveaways
SET message_layout = '{"format": "TEXT", "content": "🎉 **GIVEAWAY** 🎉\nPrize: **{prize}**\nClick the button below to enter!", "embed": {}}'::jsonb
WHERE (message_layout->>'format' = 'TEXT'
    AND COALESCE(message_layout->>'content', '') ~ '^\s*$')
   OR (message_layout ? 'message');

ALTER TABLE giveaways
    ALTER COLUMN message_layout SET DEFAULT '{"format": "TEXT", "content": "🎉 **GIVEAWAY** 🎉\nPrize: **{prize}**\nClick the button below to enter!", "embed": {}}'::jsonb;
