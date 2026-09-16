#![allow(missing_docs, clippy::unused_async)]
use crate::constants::BRAND_COLOR;
use crate::core::config::settings::{get_settings, save_settings};
use crate::core::config::state::{Context, Error};
use crate::features::custom_commands::database;
use crate::features::custom_commands::types::{
    CustomCommandsConfig, DEFAULT_PREFIX, resolve_prefix,
};
use crate::shared::messages::send_ephemeral;
use anyhow::Context as _;
use poise::CreateReply;
use serenity::all::CreateEmbed;
use tracing::error;

/// List all custom commands available in this server
#[poise::command(slash_command, guild_only)]
pub async fn custom_commands(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer().await?;
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let data = ctx.data();
    let pool = &data.core.db;
    let commands = match database::get_custom_command(pool, guild_id).await {
        Ok(cmds) => cmds,
        Err(e) => {
            error!(error = ?e, %guild_id, "Failed to fetch custom commands");
            ctx.say("Failed to fetch custom commands from database.")
                .await?;
            return Ok(());
        }
    };

    let prefix = match get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await
    {
        Ok(settings) => resolve_prefix(&settings).to_string(),
        Err(e) => {
            error!(error = ?e, %guild_id, "Failed to load prefix for list");
            DEFAULT_PREFIX.to_string()
        }
    };

    if commands.is_empty() {
        let embed = CreateEmbed::new()
            .title("Custom Server Commands")
            .description(format!(
                "No custom commands have been created for this server yet!\nTrigger prefix is `{prefix}` — change it with `/prefix set`."
            ))
            .color(BRAND_COLOR);

        ctx.send(CreateReply::default().embed(embed)).await?;
        return Ok(());
    }

    let mut command_list = Vec::new();
    for cmd in &commands {
        let desc = cmd
            .description
            .as_deref()
            .filter(|d| !d.trim().is_empty())
            .unwrap_or("No description provided.");

        command_list.push(format!("• **{prefix}{}**: {}", cmd.name, desc));
    }

    let full_description = command_list.join("\n");
    let display_description = if full_description.len() > 4000 {
        format!("{}...\n\n*And more!*", &full_description[..3900])
    } else {
        full_description
    };

    let embed = CreateEmbed::new()
        .title(format!("📜 Custom Commands ({})", commands.len()))
        .description(display_description)
        .color(BRAND_COLOR)
        .footer(serenity::all::CreateEmbedFooter::new(format!(
            "Use {prefix}<name> in chat (or @bot <name>) to run a command!"
        )));

    ctx.send(CreateReply::default().embed(embed)).await?;
    Ok(())
}

/// View or change the prefix used to trigger custom commands (and prefix commands).
#[poise::command(
    slash_command,
    guild_only,
    subcommands("set_prefix", "view_prefix", "reset_prefix"),
    rename = "prefix"
)]
pub async fn prefix(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Set a new custom prefix for this server (1–3 symbols, no letters/numbers/spaces).
#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_GUILD",
    rename = "set"
)]
pub async fn set_prefix(
    ctx: Context<'_>,
    #[description = "New prefix, e.g. ! or ? or !!"]
    #[max_length = 3]
    new_prefix: String,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let normalized = match CustomCommandsConfig::validate_prefix(&new_prefix) {
        Ok(p) => p,
        Err(msg) => {
            send_ephemeral(&ctx, msg).await?;
            return Ok(());
        }
    };

    let data = ctx.data();
    let mut settings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;
    let mut cfg = settings.custom_commands.unwrap_or_default();
    cfg.prefix = normalized.clone();
    settings.custom_commands = Some(cfg);
    if let Err(e) = save_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
        &settings,
    )
    .await
    {
        error!(error = ?e, %guild_id, "Failed to save custom prefix");
        send_ephemeral(&ctx, "Something went wrong on our end.").await?;
        return Ok(());
    }

    send_ephemeral(&ctx, format!("Prefix updated to `{normalized}`.")).await?;
    Ok(())
}

/// Show the current custom prefix for this server.
#[poise::command(slash_command, guild_only, rename = "view")]
pub async fn view_prefix(ctx: Context<'_>) -> Result<(), Error> {
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let data = ctx.data();
    let settings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;
    let prefix = resolve_prefix(&settings);
    send_ephemeral(&ctx, format!("Current prefix is `{prefix}`.")).await?;
    Ok(())
}

/// Reset the custom prefix back to the default (`!`).
#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_GUILD",
    rename = "reset"
)]
pub async fn reset_prefix(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let data = ctx.data();
    let mut settings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;
    let mut cfg = settings.custom_commands.unwrap_or_default();
    cfg.prefix = DEFAULT_PREFIX.to_string();
    settings.custom_commands = Some(cfg);
    if let Err(e) = save_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
        &settings,
    )
    .await
    {
        error!(error = ?e, %guild_id, "Failed to reset custom prefix");
        send_ephemeral(&ctx, "Something went wrong on our end.").await?;
        return Ok(());
    }

    send_ephemeral(&ctx, format!("Prefix reset to `{DEFAULT_PREFIX}`.")).await?;
    Ok(())
}
