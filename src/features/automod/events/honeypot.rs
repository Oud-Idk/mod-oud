use crate::Data;
use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::settings::{get_settings, GuildSettings};
use crate::features::automod::insert_automod_row;
use crate::features::moderation::{replace_system_ban_placeholders, schedule_unban};
use crate::shared::embed::build_custom_message;
use anyhow::{Context as _, Result};
use poise::serenity_prelude as serenity;
use serenity::all::{ChannelId, Context, CreateEmbed, CreateEmbedFooter, CreateMessage, GuildId, Message, RoleId};
use std::time::Duration;
use tracing::{info, instrument};

/// Handles honeypot detection and banishing. Returns `Ok(true)` if a user was caught and banished.
#[instrument(skip(ctx, data, message), fields(author_id = %message.author.id))]
pub async fn handle_honeypot(
    ctx: &Context,
    message: &Message,
    data: &Data,
) -> Result<bool> {
    if message.author.bot { return Ok(false); }

    let Some(guild_id) = message.guild_id else {
        return Ok(false);
    };
    let config = get_settings(&data.db, &data.redis, &data.guild_configs, guild_id.get() as i64).await?;

    let Some(honeypot) = config.honeypot.as_ref() else {
        return Ok(false);
    };

    // Fast exit if this channel is NOT the honeypot channel
    let is_honeypot_channel = honeypot
        .channel_id
        .as_ref()
        .and_then(|id_str| id_str.parse::<u64>().ok())
        .map(ChannelId::new) == Some(message.channel_id);

    if !is_honeypot_channel {
        return Ok(false);
    }

    // Check role exemptions
    if let Some(member) = &message.member {
        if let Some(exempt_roles) = &honeypot.exempt_roles {
            let is_exempt = member.roles.iter().any(|user_role| {
                exempt_roles.iter().any(|role_str| {
                    role_str.parse::<u64>().ok().map(RoleId::new) == Some(*user_role)
                })
            });

            if is_exempt {
                return Ok(false);
            }
        }
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

    insert_automod_row(
        &data.db,
        guild_id.get() as i64,
        message.author.id.get() as i64,
        None, None, "Honeypot", None,
        Some(&message.content), &["ban"], "",
    )
        .await
        .context("Failed to log honeypot automod action")?;


    if let Ok(dm_channel) = message.author.create_dm_channel(&ctx.http).await {
        let honeypot_dm_settings = config.moderation_dms.as_ref().and_then(|m| m.honeypot.as_ref());

        if let Some(dm_config) = honeypot_dm_settings {
            if let Ok(Some(msg_builder)) = build_custom_message(
                &dm_config.format,
                Some(dm_config.content.as_str()),
                dm_config.embed.as_ref(),
                |text| replace_system_ban_placeholders(text, &gctx, &message.author, duration),
            ) {
                let _ = dm_channel.send_message(&ctx.http, msg_builder).await;
            }
        } else {
            let fallback_embed = CreateEmbed::new()
                .title(format!("You have been banned from {}", gctx.name))
                .color(0xFF4747)
                .field("Reason", reason, false)
                .footer(CreateEmbedFooter::new("If you believe this was a mistake, please contact an administrator."));

            let _ = dm_channel.send_message(&ctx.http, CreateMessage::new().embed(fallback_embed)).await;
        }
    }

    guild_id
        .ban_with_reason(&ctx.http, message.author.id, dmd, reason)
        .await
        .context("Failed to ban honeypot offender")?;

    if let Some(dur) = duration {
        schedule_unban(&data.db, guild_id, &message.author, dur)
            .await
            .context("Failed to schedule temp unban for honeypot offender")?;
    }

    info!(user_id = %message.author.id, guild_id = %guild_id, "Honeypot offender banished successfully");
    Ok(true)
}