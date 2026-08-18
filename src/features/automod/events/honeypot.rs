use crate::constants::BRAND_COLOR;
use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::settings::get_settings;
use crate::core::config::state::BotData;
use crate::features::automod::database::log_automod_event;
use crate::features::moderation::{replace_system_ban_placeholders, schedule_unban};
use crate::shared::embed::build_custom_message;
use crate::shared::permissions::HasRoles;
use anyhow::{Context as _, Result};
use poise::serenity_prelude as serenity;
use serenity::all::{Context, CreateEmbed, CreateEmbedFooter, CreateMessage, Message};
use std::time::Duration;
use tracing::{info, instrument};

#[instrument(skip(ctx, data, message), fields(author_id = %message.author.id))]
pub async fn handle_honeypot(ctx: &Context, message: &Message, data: &BotData) -> Result<bool> {
    if message.author.bot {
        return Ok(false);
    }
    let Some(guild_id) = message.guild_id else {
        return Ok(false);
    };

    let config = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;

    let Some(honeypot) = config.honeypot.as_ref() else {
        return Ok(false);
    };

    // Short circuit if this channel is not the honeypot channel
    let is_honeypot_channel = honeypot.channel_id == Some(message.channel_id);
    if !is_honeypot_channel {
        return Ok(false);
    }

    // Check role exemptions
    if let Some(member) = &message.member
        && let Some(exempt_roles) = &honeypot.exempt_roles
        && member.has_any_role(exempt_roles)
    {
        return Ok(false);
    }

    message.delete(ctx).await?;

    let dmd = honeypot.dmd.unwrap_or(0);
    let reason = honeypot
        .reason
        .as_deref()
        .filter(|r| !r.trim().is_empty())
        .unwrap_or("Sending a message in a honeypot channel");

    let duration = honeypot.duration.map(Duration::from_millis);
    let gctx = get_guild_ctx(guild_id, ctx).await?;

    log_automod_event(
        &data.core.db,
        message,
        "Honeypot",
        Some(&message.content),
        &["BAN"],
    )
    .await
    .context("Failed to log honeypot automod action")?;

    if let Ok(dm_channel) = message.author.create_dm_channel(&ctx.http).await {
        let honeypot_dm_settings = config
            .moderation_dms
            .as_ref()
            .and_then(|m| m.honeypot.as_ref());

        if let Some(dm_config) = honeypot_dm_settings {
            if let Ok(Some(msg_builder)) = build_custom_message(
                dm_config.message.format,
                &dm_config.message.content,
                &dm_config.message.embed,
                |text| replace_system_ban_placeholders(text, &gctx, &message.author, duration),
            ) {
                let _ = dm_channel.send_message(&ctx.http, msg_builder).await;
            }
        } else {
            let fallback_embed = CreateEmbed::new()
                .title(format!("You have been banned from {}", gctx.name))
                .color(BRAND_COLOR)
                .field("Reason", reason, false)
                .footer(CreateEmbedFooter::new(
                    "If you believe this was a mistake, please contact an administrator.",
                ));

            let _ = dm_channel
                .send_message(&ctx.http, CreateMessage::new().embed(fallback_embed))
                .await;
        }
    }

    guild_id
        .ban_with_reason(&ctx.http, message.author.id, dmd, reason)
        .await
        .context("Failed to ban honeypot offender")?;

    if let Some(dur) = duration {
        schedule_unban(&data.core.db, guild_id, &message.author, dur)
            .await
            .context("Failed to schedule temp unban for honeypot offender")?;
    }

    info!(user_id = %message.author.id, %guild_id, "Honeypot offender banished successfully");
    Ok(true)
}
