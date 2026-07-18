CREATE TABLE IF NOT EXISTS invited_members
(
    guild_id    BIGINT      NOT NULL,
    member_id   BIGINT      NOT NULL,
    inviter_id  BIGINT      NOT NULL,
    invite_code TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id, member_id)
);

CREATE TABLE IF NOT EXISTS inviter_counts
(
    guild_id   BIGINT NOT NULL,
    inviter_id BIGINT NOT NULL,
    count      BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, inviter_id)
);

CREATE INDEX IF NOT EXISTS idx_inviter_counts_leaderboard
    ON inviter_counts (guild_id, count DESC);