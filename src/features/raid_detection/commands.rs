#![allow(missing_docs, clippy::unused_async)]
use crate::core::config::state::{Context, Error};
use crate::features::raid_detection::triggers::{resolve_raid_manual, trigger_raid_manual};
use anyhow::Context as _;
use anyhow::Result;

/// Raid management commands
#[poise::command(
    slash_command,
    subcommands("trigger", "resolve"),
    guild_only,
    default_member_permissions = "MANAGE_GUILD"
)]
pub async fn raid(_ctx: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Manually activate raid detection and apply server incident protections
#[poise::command(slash_command, guild_only)]
pub async fn trigger(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer().await?;

    let guild_id = ctx.guild_id().with_context(|| "Must be run in a server")?;
    let author_name = ctx.author().name.clone();

    match trigger_raid_manual(ctx.serenity_context(), ctx.data(), guild_id, &author_name).await {
        Ok(true) => {
            ctx.say("**Raid Mode Activated**. Incident responses applied.")
                .await?;
        }
        Ok(false) => {
            ctx.say("Raid mode is **already active** for this server.")
                .await?;
        }
        Err(e) => {
            tracing::error!(error = ?e, "Error triggering manual raid");
            ctx.say("❌ Failed to trigger raid mode. Check bot permissions.")
                .await?;
        }
    }

    Ok(())
}

/// Manually resolve an active raid and restore pre-raid permissions
#[poise::command(slash_command, guild_only)]
pub async fn resolve(ctx: Context<'_>) -> Result<()> {
    ctx.defer().await?;

    let guild_id = ctx.guild_id().with_context(|| "Must be run in a server")?;

    match resolve_raid_manual(ctx.serenity_context(), ctx.data(), guild_id).await {
        Ok(true) => {
            ctx.say("**Raid Resolved**. Pre-raid permissions and settings restored.")
                .await?;
        }
        Ok(false) => {
            ctx.say("No active raid session found to resolve.").await?;
        }
        Err(e) => {
            tracing::error!(error = ?e, "Error resolving manual raid");
            ctx.say("❌ Failed to resolve raid mode.").await?;
        }
    }

    Ok(())
}
