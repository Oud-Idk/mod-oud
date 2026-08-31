CREATE TABLE IF NOT EXISTS economy_balances
(
    guild_id BIGINT NOT NULL,
    user_id  BIGINT NOT NULL,
    cash     BIGINT NOT NULL DEFAULT 0,
    bank     BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
);
