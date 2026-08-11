use crate::core::config::settings::{get_settings, save_settings};
use crate::core::config::state::{Context, Error};
use crate::features::automod::HoneypotConfig;
use anyhow::anyhow;
use poise::serenity_prelude as serenity;
use serenity::all::GuildChannel;

/// Parent command group for Honeypot management
#[poise::command(
    slash_command,
    subcommands("set", "disable"),
    guild_only,
    required_permissions = "MANAGE_GUILD"
)]
pub async fn honeypot(_ctx: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Set the honeypot channel
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_GUILD")]
pub async fn set(
    ctx: Context<'_>,
    #[description = "The channel to use as a honeypot"] channel: GuildChannel,
) -> Result<(), Error> {
    let guild_id = ctx
        .guild_id()
        .ok_or_else(|| anyhow!("Command must be used inside a server."))?;

    let data = ctx.data();

    // Fetch existing guild settings
    let mut settings =
        get_settings(&data.core.db, &data.core.redis, &data.core.guild_configs_cache, guild_id.get() as i64).await?;

    // Get or initialize HoneypotConfig
    let mut honeypot = settings.honeypot.unwrap_or_else(|| HoneypotConfig {
        enabled: Some(true),
        channel_id: None,
        exempt_roles: Some(Vec::new()),
        dmd: Some(3),
        reason: Some("Sending a message in a honeypot channel".to_string()),
        duration: None,
    });

    honeypot.channel_id = Some(channel.id.get());

    settings.honeypot = Some(honeypot);

    save_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id.get() as i64,
        &settings,
    )
        .await?;

    ctx.say(format!("✅ Honeypot channel set to <#{}> and enabled.", channel.id))
        .await?;

    Ok(())
}

/// Quick helper command to disable the honeypot feature
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_GUILD")]
pub async fn disable(ctx: Context<'_>) -> Result<(), Error> {
    let guild_id = ctx
        .guild_id()
        .ok_or_else(|| anyhow!("Must be used in a server"))?;
    let data = ctx.data();

    let mut settings =
        get_settings(&data.core.db, &data.core.redis, &data.core.guild_configs_cache, guild_id.get() as i64).await?;

    if let Some(ref mut honeypot) = settings.honeypot {
        honeypot.enabled = Some(false);

        save_settings(
            &data.core.db,
            &data.core.redis,
            &data.core.guild_configs_cache,
            guild_id.get() as i64,
            &settings,
        )
            .await?;

        ctx.say("Honeypot has been disabled.").await?;
    } else {
        ctx.say("Honeypot is not configured.").await?;
    }

    Ok(())
}