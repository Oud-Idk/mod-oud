CREATE TYPE MESSAGE_FORMAT AS ENUM ('embed', 'text');
CREATE TYPE INTERACTION_MODE AS ENUM ('reaction', 'button');
CREATE TYPE BUTTON_STYLE AS ENUM ('primary', 'secondary', 'success', 'danger');

CREATE TABLE reaction_messages
(
    id         BIGSERIAL PRIMARY KEY,
    message_id BIGINT UNIQUE,
    name       TEXT             NOT NULL,
    channel_id BIGINT           NOT NULL,
    guild_id   BIGINT           NOT NULL,
    mode       INTERACTION_MODE NOT NULL DEFAULT 'reaction',

    format     MESSAGE_FORMAT   NOT NULL,
    embed      TEXT,
    content    TEXT
);

CREATE TABLE reaction_roles
(
    id                  BIGSERIAL PRIMARY KEY,
    reaction_message_id BIGINT REFERENCES reaction_messages (id) ON DELETE CASCADE,

    emoji               TEXT   NOT NULL,
    role_id             BIGINT NOT NULL,

    CONSTRAINT reaction_data_check CHECK (
        TRIM(emoji) <> ''
        ),

    UNIQUE (reaction_message_id, emoji)
);

CREATE TABLE button_roles
(
    id                  SERIAL PRIMARY KEY,
    reaction_message_id BIGINT REFERENCES reaction_messages (id) ON DELETE CASCADE,

    role_id             BIGINT       NOT NULL,
    custom_id           BIGINT       NOT NULL,
    label               TEXT,
    style               BUTTON_STYLE NOT NULL DEFAULT 'primary',
    emoji               TEXT,

    CONSTRAINT button_data_check CHECK (
        (TRIM(label) <> '' OR TRIM(emoji) <> '')
        ),

    UNIQUE (reaction_message_id, custom_id)
);

CREATE INDEX idx_reaction_messages_guild ON reaction_messages (guild_id);