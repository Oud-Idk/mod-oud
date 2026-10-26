#![allow(missing_docs, clippy::unused_async)]

use crate::core::config::settings::{GuildSettings, get_settings, save_settings};
use crate::core::config::state::Context;
use crate::features::dynamic_slowmode::audit;
use crate::features::dynamic_slowmode::counter::is_supported_kind;
use crate::features::dynamic_slowmode::database;
use crate::features::dynamic_slowmode::jobs;
use crate::features::dynamic_slowmode::types::{DisarmReason, DynamicSlowmodeConfig, LADDER};
use crate::shared::messages::send_ephemeral;
use anyhow::{Context as _, Result};
use serenity::all::{Channel, ChannelId, CreateEmbed, Mentionable};
use std::fmt::Write;

/// Configure dynamic slowmode for this server.
#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_CHANNELS",
    subcommands("enable", "disable", "channel", "info", "rearm")
)]
pub async fn slowmode(_: Context<'_>) -> Result<()> {
    Ok(())
}

/// Turn dynamic slowmode on for this server.
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_CHANNELS")]
pub async fn enable(ctx: Context<'_>) -> Result<()> {
    ctx.defer_ephemeral().await?;

    let mut config = load_config(&ctx).await?;
    if config.enabled {
        send_ephemeral(&ctx, "Dynamic slowmode is already enabled.").await?;
        return Ok(());
    }

    config.enabled = true;
    save_config(&ctx, config.clone()).await?;
    let armed = arm_configured_channels(&ctx, &config).await?;

    send_ephemeral(
        &ctx,
        format!("Dynamic slowmode enabled. Tracking {armed} channel(s)."),
    )
    .await?;
    Ok(())
}

/// Turn dynamic slowmode off and restore the channels it changed.
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_CHANNELS")]
pub async fn disable(ctx: Context<'_>) -> Result<()> {
    ctx.defer_ephemeral().await?;

    let mut config = load_config(&ctx).await?;
    if !config.enabled {
        send_ephemeral(&ctx, "Dynamic slowmode is not enabled.").await?;
        return Ok(());
    }

    config.enabled = false;
    save_config(&ctx, config).await?;
    let restored = restore_all(&ctx).await?;

    send_ephemeral(
        &ctx,
        format!("Dynamic slowmode disabled. Restored {restored} channel(s)."),
    )
    .await?;
    Ok(())
}

/// Add, remove, or list the channels dynamic slowmode tracks.
#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_CHANNELS",
    subcommands("channel_add", "channel_remove", "channel_list")
)]
pub async fn channel(_: Context<'_>) -> Result<()> {
    Ok(())
}

/// Start tracking a channel.
#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_CHANNELS",
    rename = "add"
)]
pub async fn channel_add(
    ctx: Context<'_>,
    #[description = "The channel to track"] target: Channel,
) -> Result<()> {
    ctx.defer_ephemeral().await?;
    let data = ctx.data();
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    let Some(kind) = target
        .clone()
        .guild()
        .map(|guild_channel| guild_channel.kind)
    else {
        send_ephemeral(&ctx, "Only server channels can be tracked.").await?;
        return Ok(());
    };

    if !is_supported_kind(kind) {
        send_ephemeral(
            &ctx,
            format!(
                "{} cannot have slowmode. Only text, voice, and stage channels can be tracked.",
                target.mention()
            ),
        )
        .await?;
        return Ok(());
    }

    let mut config = load_config(&ctx).await?;
    if config.channels.contains(&target.id()) {
        send_ephemeral(&ctx, "That channel is already tracked.").await?;
        return Ok(());
    }

    config.channels.push(target.id());
    save_config(&ctx, config.clone()).await?;

    if config.enabled {
        let pre = jobs::live_slowmode(ctx.http(), target.id())
            .await?
            .unwrap_or_default();
        database::arm(&data.core.db, target.id(), guild_id, pre).await?;
    }

    send_ephemeral(&ctx, format!("Now tracking {}.", target.mention())).await?;
    Ok(())
}

/// Stop tracking a channel and restore its slowmode.
#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_CHANNELS",
    rename = "remove"
)]
pub async fn channel_remove(
    ctx: Context<'_>,
    #[description = "The channel to stop tracking"] target: Channel,
) -> Result<()> {
    ctx.defer_ephemeral().await?;

    let mut config = load_config(&ctx).await?;
    if !config.channels.contains(&target.id()) {
        send_ephemeral(&ctx, "That channel is not tracked.").await?;
        return Ok(());
    }

    config.channels.retain(|id| *id != target.id());
    save_config(&ctx, config).await?;
    restore_channel(&ctx, target.id()).await?;

    send_ephemeral(&ctx, format!("No longer tracking {}.", target.mention())).await?;
    Ok(())
}

/// List the channels dynamic slowmode tracks.
#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_CHANNELS",
    rename = "list"
)]
pub async fn channel_list(ctx: Context<'_>) -> Result<()> {
    ctx.defer_ephemeral().await?;

    let config = load_config(&ctx).await?;
    if config.channels.is_empty() {
        send_ephemeral(&ctx, "No channels are tracked yet.").await?;
        return Ok(());
    }

    let mut list = String::from("Tracked channels:\n");
    for channel_id in &config.channels {
        let _ = writeln!(list, "- <#{channel_id}>");
    }

    send_ephemeral(&ctx, list).await?;
    Ok(())
}

/// Show what dynamic slowmode is doing in this server.
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_CHANNELS")]
pub async fn info(ctx: Context<'_>) -> Result<()> {
    ctx.defer_ephemeral().await?;
    let data = ctx.data();
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    let config = load_config(&ctx).await?;
    let states = database::list_armed_for_guild(&data.core.db, guild_id).await?;

    let mut description = String::new();
    if states.is_empty() {
        description.push_str("No channel is being automated right now.\n");
    } else {
        for state in &states {
            let _ = writeln!(
                description,
                "<#{}>: {}s (started from {}s)",
                state.channel_id, state.last_written_secs, state.pre_automation_secs
            );
        }
    }

    let embed = CreateEmbed::new()
        .title("Dynamic Slowmode")
        .field(
            "Status",
            if config.enabled {
                "Enabled"
            } else {
                "Disabled"
            },
            true,
        )
        .field("Tracked channels", config.channels.len().to_string(), true)
        .field("Ceiling", format!("{}s", config.ceiling_secs), true)
        .field("Window", format!("{}s", config.window_secs), true)
        .field(
            "Ladder",
            LADDER
                .iter()
                .map(|rung| format!("{rung}s"))
                .collect::<Vec<_>>()
                .join(" / "),
            false,
        )
        .field("Channels", description, false)
        .color(crate::constants::BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed).ephemeral(true))
        .await?;
    Ok(())
}

/// Resume automation for a channel that was disarmed.
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_CHANNELS")]
pub async fn rearm(
    ctx: Context<'_>,
    #[description = "The channel to resume automating"] target: Channel,
) -> Result<()> {
    ctx.defer_ephemeral().await?;
    let data = ctx.data();
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    let config = load_config(&ctx).await?;
    if !config.enabled || !config.channels.contains(&target.id()) {
        send_ephemeral(&ctx, "That channel is not tracked by dynamic slowmode.").await?;
        return Ok(());
    }

    let pre = jobs::live_slowmode(ctx.http(), target.id())
        .await?
        .unwrap_or_default();
    database::arm(&data.core.db, target.id(), guild_id, pre).await?;
    audit::rearmed(guild_id, target.id());

    send_ephemeral(&ctx, format!("Resumed automating {}.", target.mention())).await?;
    Ok(())
}

/// Reads the guild's stored policy, defaulting when unset.
async fn load_config(ctx: &Context<'_>) -> Result<DynamicSlowmodeConfig> {
    let data = ctx.data();
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    Ok(get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?
    .dynamic_slowmode
    .map(|boxed| *boxed)
    .unwrap_or_default())
}

/// Writes the policy into the guild's settings blob.
async fn save_config(ctx: &Context<'_>, config: DynamicSlowmodeConfig) -> Result<()> {
    let data = ctx.data();
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    let mut settings: GuildSettings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;

    settings.dynamic_slowmode = Some(Box::new(config));

    save_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
        &settings,
    )
    .await
}

/// Arms every configured channel that is not armed yet.
async fn arm_configured_channels(
    ctx: &Context<'_>,
    config: &DynamicSlowmodeConfig,
) -> Result<usize> {
    let data = ctx.data();
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let mut armed = 0;

    for channel_id in &config.channels {
        let already_armed = database::fetch_state(&data.core.db, *channel_id)
            .await?
            .is_some_and(|state| state.is_armed());

        if !already_armed {
            let pre = jobs::live_slowmode(ctx.http(), *channel_id)
                .await?
                .unwrap_or_default();
            database::arm(&data.core.db, *channel_id, guild_id, pre).await?;
        }

        armed += 1;
    }

    Ok(armed)
}

/// Restores one channel and drops its row.
///
/// If Discord refuses the restore the row stays armed; the tick retires it on a later pass.
async fn restore_channel(ctx: &Context<'_>, channel_id: ChannelId) -> Result<()> {
    let data = ctx.data();

    let Some(state) = database::fetch_state(&data.core.db, channel_id).await? else {
        return Ok(());
    };

    jobs::restore_channel(&data.core.db, ctx.http(), &state).await?;
    Ok(())
}

/// Restores every armed channel in this guild.
async fn restore_all(ctx: &Context<'_>) -> Result<usize> {
    let data = ctx.data();
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    let states = database::list_armed_for_guild(&data.core.db, guild_id).await?;
    let count = states.len();

    for state in states {
        restore_channel(ctx, state.channel_id).await?;
    }

    Ok(count)
}

/// Human-readable reason a channel stopped being automated.
///
/// Presentation shared by the slash command and the status endpoint, so it lives outside `types`.
#[must_use]
pub fn disarm_label(reason: Option<&str>) -> &'static str {
    match reason {
        Some(raw) if raw == DisarmReason::HumanEdit.as_str() => {
            "A moderator changed the slowmode by hand"
        }
        Some(_) => "Disabled by an admin",
        None => "Automating",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disarm_label_describes_each_reason() {
        assert_eq!(disarm_label(None), "Automating");
        assert_eq!(
            disarm_label(Some(DisarmReason::HumanEdit.as_str())),
            "A moderator changed the slowmode by hand"
        );
        assert_eq!(disarm_label(Some("SOMETHING_ELSE")), "Disabled by an admin");
    }
}
