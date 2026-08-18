#![allow(missing_docs, clippy::unused_async)]
use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::custom_commands::database;
use poise::CreateReply;
use serenity::all::CreateEmbed;
use tracing::error;

/// List all custom commands available in this server
#[poise::command(slash_command, guild_only)]
pub async fn custom_commands(ctx: Context<'_>) -> Result<(), Error> {
    let Some(guild_id) = ctx.guild_id() else {
        ctx.say("This command can only be used inside a server.")
            .await?;
        return Ok(());
    };

    let pool = &ctx.data().core.db;

    let commands = match database::get_custom_command(pool, guild_id).await {
        Ok(cmds) => cmds,
        Err(e) => {
            error!(error = ?e, %guild_id, "Failed to fetch custom commands");
            ctx.say("Failed to fetch custom commands from database.")
                .await?;
            return Ok(());
        }
    };

    if commands.is_empty() {
        let embed = CreateEmbed::new()
            .title("Custom Server Commands")
            .description("No custom commands have been created for this server yet!")
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

        command_list.push(format!("• **!{}** — {}", cmd.name, desc));
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
        .footer(serenity::all::CreateEmbedFooter::new(
            "Use any trigger above in chat to run the command!",
        ));

    ctx.send(CreateReply::default().embed(embed)).await?;
    Ok(())
}
