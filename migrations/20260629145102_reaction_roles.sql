CREATE TYPE MESSAGE_FORMAT AS ENUM ('embed', 'text');
CREATE TYPE INTERACTION_MODE AS ENUM ('reaction', 'button');
CREATE TYPE BUTTON_STYLE AS ENUM ('primary', 'secondary', 'success', 'danger');

CREATE TABLE reaction_messages
(
    id         SERIAL PRIMARY KEY,
    message_id TEXT UNIQUE,
    name       TEXT             NOT NULL,
    channel_id TEXT             NOT NULL,
    guild_id   TEXT             NOT NULL,
    mode       INTERACTION_MODE NOT NULL DEFAULT 'reaction',

    format     MESSAGE_FORMAT   NOT NULL,
    embed      TEXT,
    content    TEXT,

    CONSTRAINT ids_not_empty CHECK (
        TRIM(message_id) <> '' AND
        TRIM(channel_id) <> '' AND
        TRIM(guild_id) <> ''
        )
);

CREATE TABLE reaction_roles
(
    id                  SERIAL PRIMARY KEY,
    reaction_message_id INTEGER REFERENCES reaction_messages (id) ON DELETE CASCADE,

    emoji               TEXT NOT NULL,
    role_id             TEXT NOT NULL,

    CONSTRAINT reaction_data_check CHECK (
        TRIM(emoji) <> '' AND
        TRIM(role_id) <> ''
        ),

    UNIQUE (reaction_message_id, emoji)
);

CREATE TABLE button_roles
(
    id                  SERIAL PRIMARY KEY,
    reaction_message_id INTEGER REFERENCES reaction_messages (id) ON DELETE CASCADE,

    role_id             TEXT         NOT NULL,
    custom_id           TEXT         NOT NULL,
    label               TEXT,
    style               BUTTON_STYLE NOT NULL DEFAULT 'primary',
    emoji               TEXT,

    CONSTRAINT button_data_check CHECK (
        TRIM(role_id) <> '' AND
        TRIM(custom_id) <> '' AND
        (TRIM(label) <> '' OR TRIM(emoji) <> '')
        ),

    UNIQUE (reaction_message_id, custom_id)
);

CREATE INDEX idx_reaction_messages_guild ON reaction_messages (guild_id);