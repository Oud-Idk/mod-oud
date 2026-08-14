#![allow(missing_docs)]
use crate::core::config::state::Context;
use crate::features::media_only::cache::{delete_media_only_channel, get_channel_media, store_media_only_channel};
use crate::features::media_only::database::list_media_only_channels;
use crate::features::media_only::types::MediaOnlyChannel;
use crate::shared::messages::send_ephemeral;
use anyhow::Result;
use serenity::all::{Channel, CreateEmbed, Mentionable};

/// Manage media-only channel enforcement for this server.
#[poise::command(
    slash_command,
    guild_only,
    subcommands(
        "set",
        "disable",
        "info",
        "list",
    )
)]
pub async fn media_only(_: Context<'_>) -> Result<()> {
    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn set(
    ctx: Context<'_>,

    #[description = "The channel to enforce media only"]
    channel: Channel,
) -> Result<()> {
    ctx.defer_ephemeral().await?;
    let data = ctx.data();
    let channel_id = channel.id();
    let Some(guild_id) = ctx.guild_id() else {
        send_ephemeral(&ctx, "This command must be run in a guild!").await?;
        return Ok(());
    };

    let mut config = get_channel_media(data, channel_id)
        .await?
        .unwrap_or_else(|| MediaOnlyChannel {
            channel_id: channel_id.get() as i64,
            guild_id: guild_id.get() as i64,
            enabled: true,
            ..Default::default()
        });

    if config.enabled {
        send_ephemeral(&ctx, format!("Media-only mode is already enabled for {}", channel.mention())).await?;
        return Ok(());
    }

    config.enabled = true;
    config.channel_id = channel_id.get() as i64;
    config.guild_id = guild_id.get() as i64;

    store_media_only_channel(&data.core.db, &data.core.redis, config).await?;
    send_ephemeral(&ctx, format!("Enforcing media-only mode on {}", channel.mention())).await?;

    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn disable(
    ctx: Context<'_>,

    #[description = "The channel to delete the media only rule"]
    channel: Channel
) -> Result<()> {
    ctx.defer_ephemeral().await?;
    let data = ctx.data();
    let channel_id = channel.id();

    let was_deleted = delete_media_only_channel(data, channel_id).await?;
    if was_deleted {
        send_ephemeral(&ctx, format!("Disabled media-only mode for {}", channel.mention())).await?;
    } else {
        send_ephemeral(&ctx, format!("Media-only mode was not enabled for {}, ignoring", channel.mention())).await?;
    }

    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn info(
    ctx: Context<'_>,

    #[description = "The channel to get info about"]
    channel: Channel
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
    let comma_separated_roles: Option<String> = cfg.exempt_roles
        .filter(|roles| !roles.is_empty())
        .map(|roles| {
            roles.iter().map(
                |id| format!("<@&{}>", *id as u64)
            ).collect::<Vec<_>>().join(", ")
        });

    let mut embed = CreateEmbed::new()
        .title(format!("Media-Only Info for {}", channel.mention()))
        .field("Images Allowed", cfg.allow_images.to_string(), true)
        .field("Videos Allowed", cfg.allow_videos.to_string(), true)
        .field("Audios Allowed", cfg.allow_audio.to_string(), true)
        .field("GIFs Allowed", cfg.allow_gif.to_string(), true)
        .field("Allow Link Attachments (YouTube, etc.)", cfg.allow_links.to_string(), true)
        .field("Auto Threading", cfg.auto_thread.to_string(), true)
        .field("Thread Name Template", cfg.thread_name_template.unwrap_or_default(), true)
        .field("Warning Auto-Delete", format!("{}s", cfg.delete_warning_after_secs), true)
        .color(0x00FF88);

    if let Some(csr) = comma_separated_roles {
        embed = embed.field("Exempt Roles", csr, false);
    }

    ctx.send(
        poise::CreateReply::default()
            .embed(embed)
            .ephemeral(true),
    )
        .await?;

    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn list(ctx: Context<'_>) -> Result<()> {
    ctx.defer_ephemeral().await?;
    let Some(guild_id) = ctx.guild_id() else {
        send_ephemeral(&ctx, "This command must be run in a guild!").await?;
        return Ok(());
    };

    let channels = list_media_only_channels(&ctx.data().core.db, guild_id).await?;
    if channels.is_empty() {
        send_ephemeral(&ctx, "No media-only set up yet.").await?;
        return Ok(());
    }

    let mut list = "Media only channels in this guild:\n".to_string();
    for channel in channels {
        list.push_str(&format!("- <#{}>\n", channel.channel_id as u64));
    }

    send_ephemeral(&ctx, list).await?;

    Ok(())
}