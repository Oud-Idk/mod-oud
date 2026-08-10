CREATE TABLE IF NOT EXISTS media_only_channels
(
    channel_id                BIGINT PRIMARY KEY,
    guild_id                  BIGINT   NOT NULL,
    enabled                   BOOLEAN  NOT NULL DEFAULT FALSE,

    allow_images              BOOLEAN  NOT NULL DEFAULT TRUE,
    allow_videos              BOOLEAN  NOT NULL DEFAULT TRUE,
    allow_audio               BOOLEAN  NOT NULL DEFAULT FALSE,
    allow_gif                 BOOLEAN  NOT NULL DEFAULT TRUE,
    allow_links               BOOLEAN  NOT NULL DEFAULT TRUE,
    allow_embedded_text       BOOLEAN  NOT NULL DEFAULT TRUE,

    auto_thread               BOOLEAN  NOT NULL DEFAULT FALSE,
    thread_name_template      TEXT,

    delete_warning_after_secs SMALLINT NOT NULL DEFAULT 5,
    exempt_roles              BIGINT[]
);