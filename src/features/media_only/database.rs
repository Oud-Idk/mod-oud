use serenity::all::{ChannelId, GuildId};
use sqlx::PgPool;
use crate::features::media_only::types::MediaOnlyChannel;
use anyhow::{Context, Result};

pub async fn fetch_media_only_from_db(db: &PgPool, channel_id: ChannelId) -> Result<Option<MediaOnlyChannel>> {
    sqlx::query_as!(
        MediaOnlyChannel,
        "SELECT * FROM media_only_channels WHERE channel_id = $1",
        channel_id.get() as i64
    )
        .fetch_optional(db)
        .await
        .context("failed to fetch media_only_channels")
}

pub async fn delete_media_only_from_db(db: &PgPool, channel_id: ChannelId) -> Result<u64> {
    let rows_affected = sqlx::query!(
        "DELETE FROM media_only_channels WHERE channel_id = $1",
        channel_id.get() as i64
    )
        .execute(db)
        .await
        .context("failed to delete media_only_channels")?
        .rows_affected();

    Ok(rows_affected)
}

pub async fn list_media_only_channels(db: &PgPool, guild_id: GuildId) -> Result<Vec<MediaOnlyChannel>> {
    sqlx::query_as!(
        MediaOnlyChannel,
        "SELECT * FROM media_only_channels WHERE guild_id = $1",
        guild_id.get().cast_signed()
    )
        .fetch_all(db)
        .await
        .context("failed to fetch media_only_channels")
}

pub async fn store_media_only_in_db(db: &PgPool, payload: &MediaOnlyChannel) -> Result<()> {
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
        payload.channel_id,
        payload.enabled,
        payload.allow_images,
        payload.allow_videos,
        payload.allow_audio,
        payload.allow_gif,
        payload.allow_links,
        payload.auto_thread,
        payload.thread_name_template,
        payload.delete_warning_after_secs,
        payload.exempt_roles.as_deref(),
        payload.guild_id,
    )
        .execute(db)
        .await
        .context("failed to insert media_only_channels")?;

    Ok(())
}