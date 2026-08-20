#![allow(missing_docs, clippy::unused_async)]
use crate::constants::BRAND_COLOR;
use crate::core::config::state::Context;
use crate::features::media_only::cache::{
    delete_media_only_channel, get_channel_media, store_media_only_channel,
};
use crate::features::media_only::database::list_media_only_channels;
use crate::features::media_only::types::{MediaOnlyChannel, MediaType};
use crate::shared::messages::send_ephemeral;
use anyhow::{Context as _, Result};
use serenity::all::{Channel, CreateEmbed, Mentionable};
use std::fmt::Write;

/// Manage media-only channel enforcement for this server.
#[poise::command(
    slash_command,
    guild_only,
    subcommands("set", "disable", "info", "list",)
)]
pub async fn media_only(_: Context<'_>) -> Result<()> {
    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn set(
    ctx: Context<'_>,

    #[description = "The channel to enforce media only"] channel: Channel,
) -> Result<()> {
    ctx.defer_ephemeral().await?;
    let data = ctx.data();
    let channel_id = channel.id();
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    let mut config = get_channel_media(data, channel_id)
        .await?
        .unwrap_or_else(|| MediaOnlyChannel {
            channel_id,
            guild_id,
            enabled: true,
            ..Default::default()
        });

    if config.enabled {
        send_ephemeral(
            &ctx,
            format!(
                "Media-only mode is already enabled for {}",
                channel.mention()
            ),
        )
        .await?;
        return Ok(());
    }

    config.enabled = true;
    config.channel_id = channel_id;
    config.guild_id = guild_id;

    store_media_only_channel(&data.core.db, &data.core.redis, config).await?;
    send_ephemeral(
        &ctx,
        format!("Enforcing media-only mode on {}", channel.mention()),
    )
    .await?;

    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn disable(
    ctx: Context<'_>,

    #[description = "The channel to delete the media only rule"] channel: Channel,
) -> Result<()> {
    ctx.defer_ephemeral().await?;
    let data = ctx.data();
    let channel_id = channel.id();

    let was_deleted = delete_media_only_channel(data, channel_id).await?;
    if was_deleted {
        send_ephemeral(
            &ctx,
            format!("Disabled media-only mode for {}", channel.mention()),
        )
        .await?;
    } else {
        send_ephemeral(
            &ctx,
            format!(
                "Media-only mode was not enabled for {}, ignoring",
                channel.mention()
            ),
        )
        .await?;
    }

    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn info(
    ctx: Context<'_>,

    #[description = "The channel to get info about"] channel: Channel,
) -> Result<()> {
    ctx.defer_ephemeral().await?;

    let data = ctx.data();
    let channel_id = channel.id();
    let Some(cfg) = get_channel_media(data, channel_id).await? else {
        send_ephemeral(&ctx, "That channel is not a media-only channel!").await?;
        return Ok(());
    };

    // Returns None for empty list,
    // Maps the list, turns it into a ping, and joins them with commas.
    let comma_separated_roles: Option<String> = cfg
        .exempt_roles
        .filter(|roles| !roles.is_empty())
        .map(|roles| {
            roles
                .iter()
                .map(|id| format!("<@&{id}>"))
                .collect::<Vec<_>>()
                .join(", ")
        });

    let status = |allowed: bool| {
        if allowed {
            "✅ Allowed"
        } else {
            "❌ Disabled"
        }
    };
    let has_media = |media: MediaType| status(cfg.allowed_media.contains(&media));

    let mut embed = CreateEmbed::new()
        .title(format!("Media-Only Info for {}", channel.mention()))
        .field("Images", has_media(MediaType::Image), true)
        .field("Videos", has_media(MediaType::Video), true)
        .field("Audios", has_media(MediaType::Audio), true)
        .field("GIFs", has_media(MediaType::Gif), true)
        .field("Links (YouTube, etc.)", has_media(MediaType::Link), true)
        .field("Embedded Text", has_media(MediaType::EmbeddedText), true)
        .field("Auto Threading", status(cfg.auto_thread), true)
        .field(
            "Thread Name Template",
            cfg.thread_name_template.as_deref().unwrap_or("None"),
            true,
        )
        .field(
            "Warning Auto-Delete",
            format!("{}s", cfg.delete_warning_after_secs),
            true,
        )
        .color(BRAND_COLOR);

    if let Some(csr) = comma_separated_roles {
        embed = embed.field("Exempt Roles", csr, false);
    }

    ctx.send(poise::CreateReply::default().embed(embed).ephemeral(true))
        .await?;

    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn list(ctx: Context<'_>) -> Result<()> {
    ctx.defer_ephemeral().await?;
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    let channels = list_media_only_channels(&ctx.data().core.db, guild_id).await?;
    if channels.is_empty() {
        send_ephemeral(&ctx, "No media-only set up yet.").await?;
        return Ok(());
    }

    let mut list = "Media only channels in this guild:\n".to_string();
    for channel in channels {
        let _ = writeln!(list, "- <#{}>", channel.channel_id);
    }

    send_ephemeral(&ctx, list).await?;

    Ok(())
}
