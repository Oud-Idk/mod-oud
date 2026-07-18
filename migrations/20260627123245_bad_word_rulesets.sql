CREATE TABLE bad_word_rulesets
(
    id                       UUID PRIMARY KEY         DEFAULT gen_random_uuid(),
    guild_id                 BIGINT       NOT NULL,
    name                     VARCHAR(255) NOT NULL,
    enabled                  BOOLEAN      NOT NULL    DEFAULT true,

    patterns                 JSONB        NOT NULL    DEFAULT '[]'::jsonb,
    actions                  JSONB        NOT NULL    DEFAULT '[]'::jsonb,

    timeout_duration_seconds INT          NULL,
    scope                    JSONB        NOT NULL    DEFAULT '{}'::jsonb,

    created_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bad_word_rulesets_guild_id ON bad_word_rulesets (guild_id);