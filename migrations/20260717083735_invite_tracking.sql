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

CREATE OR REPLACE FUNCTION update_inviter_counts()
    RETURNS TRIGGER AS
$$
BEGIN
    IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE' AND OLD.inviter_id IS DISTINCT FROM NEW.inviter_id) THEN
        UPDATE inviter_counts
        SET count = count - 1
        WHERE guild_id = OLD.guild_id
          AND inviter_id = OLD.inviter_id;

        DELETE
        FROM inviter_counts
        WHERE guild_id = OLD.guild_id
          AND inviter_id = OLD.inviter_id
          AND count <= 0;
    END IF;

    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.inviter_id IS DISTINCT FROM NEW.inviter_id) THEN
        INSERT INTO inviter_counts (guild_id, inviter_id, count)
        VALUES (NEW.guild_id, NEW.inviter_id, 1)
        ON CONFLICT (guild_id, inviter_id) DO UPDATE
            SET count = inviter_counts.count + 1;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_sync_inviter_counts
    AFTER INSERT OR UPDATE OR DELETE
    ON invited_members
    FOR EACH ROW
EXECUTE FUNCTION update_inviter_counts();