use crate::core::config::{get_guild_ctx, get_settings, replace_placeholders};
use crate::types::types::{Data, Error};

/// Previews the configured welcome message or embed in the current channel.
#[poise::command(slash_command, guild_only, default_member_permissions = "MANAGE_GUILD")]
pub async fn preview_welcome(ctx: poise::Context<'_, Data, Error>) -> Result<(), Error> {
    let db = &ctx.data().db;
    let redis = &ctx.data().redis;
    let guild_id = ctx.guild_id().ok_or("Must be run inside a guild")?.get() as i64;

    // 1. Fetch current database configurations
    let settings = get_settings(db, redis, guild_id).await?;

    let welcome_settings = settings.welcome
        .ok_or("Welcome system is not configured in settings")?;

    let enabled = welcome_settings.enabled
        .unwrap_or(false);

    // 2. Resolve the sender and channel to use as the template context
    let member = ctx.author_member().await
        .ok_or("Could not resolve your member context")?;

    let channel = ctx.guild_channel().await
        .ok_or("Could not resolve the current guild channel")?;

    // Mock the alt warning string for visual verification
    let warning_text = "⚠️ [MOCK: Account was created 2 hours ago]";

    // Fetch the parsed template context
    let gctx = get_guild_ctx(&member, ctx.serenity_context()).await?;

    let mut reply = poise::CreateReply::default();
    let mut has_preview = false;

    let format = welcome_settings.format.as_deref().unwrap_or("embed");

    // Previews Standard Plaintext Mode
    if format == "text" {
        if let Some(ref text_template) = welcome_settings.content {
            if !text_template.trim().is_empty() {
                let parsed_content = replace_placeholders(
                    text_template,
                    &gctx,
                    &member,
                    &channel,
                    None,
                    Some(warning_text),
                );
                reply = reply.content(format!("{}\n(Is enabled now: {})", parsed_content, enabled));
                has_preview = true;
            }
        }
    }
    // Previews Embed Mode
    else if format == "embed" {
        if let Some(ref custom_embed_template) = welcome_settings.embed {
            if !custom_embed_template.is_empty() {
                let mut embed = custom_embed_template
                    .to_create_embed_with_ctx(
                        &member,
                        &channel,
                        &gctx,
                        None,
                        Some(warning_text),
                    )?;

                // 2. Add the field if welcome is disabled
                if !enabled {
                    embed = embed.field(
                        "⚠️ Warning",
                        "Welcome messages are currently disabled.",
                        false, // set inline to true/false depending on preferred layout
                    );
                }

                reply = reply.embed(embed);
                has_preview = true;
            }
        }
    }

    if !has_preview {
        return Err("Welcome configuration has no active format or the active template is empty.".into());
    }

    // 4. Send preview
    ctx.send(reply).await?;
    Ok(())
}