use crate::features::media_only::types::MediaOnlyChannel;
use anyhow::{Context, Result};
use serenity::all::{ChannelId, GuildId, RoleId};
use sqlx::PgPool;

/// Raw database representation of a media-only channel row.
#[allow(clippy::struct_excessive_bools)]
#[derive(sqlx::FromRow)]
struct MediaOnlyChannelRow {
    channel_id: i64,
    guild_id: i64,
    enabled: bool,

    allow_images: bool,
    allow_videos: bool,
    allow_audio: bool,
    allow_gif: bool,
    allow_links: bool,
    allow_embedded_text: bool,

    auto_thread: bool,
    thread_name_template: Option<String>,

    delete_warning_after_secs: i16,
    exempt_roles: Option<Vec<i64>>,
}

impl From<MediaOnlyChannelRow> for MediaOnlyChannel {
    fn from(row: MediaOnlyChannelRow) -> Self {
        Self {
            channel_id: ChannelId::new(row.channel_id.cast_unsigned()),
            guild_id: GuildId::new(row.guild_id.cast_unsigned()),
            enabled: row.enabled,
            allow_images: row.allow_images,
            allow_videos: row.allow_videos,
            allow_audio: row.allow_audio,
            allow_gif: row.allow_gif,
            allow_links: row.allow_links,
            allow_embedded_text: row.allow_embedded_text,
            auto_thread: row.auto_thread,
            thread_name_template: row.thread_name_template,
            delete_warning_after_secs: row.delete_warning_after_secs,
            exempt_roles: row
                .exempt_roles
                .map(|roles| roles.into_iter().map(|id| RoleId::new(id.cast_unsigned())).collect()),
        }
    }
}

pub async fn fetch_media_only_from_db(
    db: &PgPool,
    channel_id: ChannelId,
) -> Result<Option<MediaOnlyChannel>> {
    sqlx::query_as!(
        MediaOnlyChannelRow,
        "SELECT * FROM media_only_channels WHERE channel_id = $1",
        channel_id.get().cast_signed()
    )
    .fetch_optional(db)
    .await
    .map(|row| row.map(MediaOnlyChannel::from))
    .context("failed to fetch media_only_channels")
}

pub async fn delete_media_only_from_db(db: &PgPool, channel_id: ChannelId) -> Result<u64> {
    let rows_affected = sqlx::query!(
        "DELETE FROM media_only_channels WHERE channel_id = $1",
        channel_id.get().cast_signed()
    )
    .execute(db)
    .await
    .context("failed to delete media_only_channels")?
    .rows_affected();

    Ok(rows_affected)
}

pub async fn list_media_only_channels(
    db: &PgPool,
    guild_id: GuildId,
) -> Result<Vec<MediaOnlyChannel>> {
    sqlx::query_as!(
        MediaOnlyChannelRow,
        "SELECT * FROM media_only_channels WHERE guild_id = $1",
        guild_id.get().cast_signed()
    )
    .fetch_all(db)
    .await
    .map(|rows| rows.into_iter().map(MediaOnlyChannel::from).collect())
    .context("failed to fetch media_only_channels")
}

pub async fn store_media_only_in_db(db: &PgPool, payload: &MediaOnlyChannel) -> Result<()> {
    let exempt_roles: Option<Vec<i64>> = payload
        .exempt_roles
        .as_ref()
        .map(|roles| roles.iter().map(|role| role.get().cast_signed()).collect());

    sqlx::query!(
        r#"
        INSERT INTO media_only_channels (
            channel_id, enabled, allow_images, allow_videos, allow_audio,
            allow_gif, allow_links, auto_thread, thread_name_template,
            delete_warning_after_secs, exempt_roles, guild_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (channel_id) DO UPDATE SET
            enabled = EXCLUDED.enabled,
            allow_images = EXCLUDED.allow_images,
            allow_videos = EXCLUDED.allow_videos,
            allow_audio = EXCLUDED.allow_audio,
            allow_gif = EXCLUDED.allow_gif,
            allow_links = EXCLUDED.allow_links,
            auto_thread = EXCLUDED.auto_thread,
            thread_name_template = EXCLUDED.thread_name_template,
            delete_warning_after_secs = EXCLUDED.delete_warning_after_secs,
            exempt_roles = EXCLUDED.exempt_roles
        "#,
        payload.channel_id.get().cast_signed(),
        payload.enabled,
        payload.allow_images,
        payload.allow_videos,
        payload.allow_audio,
        payload.allow_gif,
        payload.allow_links,
        payload.auto_thread,
        payload.thread_name_template,
        payload.delete_warning_after_secs,
        exempt_roles.as_deref(),
        payload.guild_id.get().cast_signed(),
    )
    .execute(db)
    .await
    .context("failed to insert media_only_channels")?;

    Ok(())
}