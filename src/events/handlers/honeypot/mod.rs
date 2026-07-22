use crate::core::config::get_guild_ctx;
use crate::events::handlers::message_filter::database::insert_automod_log;
use crate::features::moderation::issuing::schedule_unban;
use crate::send_mod_dm;
use crate::shared::embed::build_custom_message;
use crate::types::config::config::GuildSettings;
use crate::types::{Data, Error};
use crate::utils::moderation::MODERATION_FOOTER;
use serenity::all::{Context, CreateEmbed, CreateEmbedFooter, CreateMessage, GuildId, Message};
use std::time::Duration;

/// Handles honeypot detection and banishing. Returns `Ok(true)` if a user was caught and banished.
pub async fn handle_honeypot(
    ctx: &Context,
    message: &Message,
    data: &Data,
    guild_id: GuildId,
    config: &GuildSettings,
) -> Result<bool, Error> {
    let Some(honeypot) = config.honeypot.as_ref() else {
        return Ok(false);
    };

    // Fast exit if this channel is NOT the honeypot channel
    let is_honeypot_channel = honeypot.channel_id
        .as_ref()
        .and_then(|id_str| id_str.parse::<u64>().ok())
        .map(|id| id == message.channel_id.get())
        .unwrap_or(false);

    if !is_honeypot_channel {
        return Ok(false);
    }

    if let Some(member) = &message.member {
        if let Some(exempt_roles) = &honeypot.exempt_roles {
            let is_exempt = member.roles.iter().any(|user_role| {
                exempt_roles.iter().any(|role_str| {
                    role_str.parse::<u64>().ok() == Some(user_role.get())
                })
            });

            if is_exempt {
                return Ok(false);
            }
        }
    }

    let dmd = honeypot.dmd.unwrap_or(0);
    let reason = honeypot.reason
        .as_deref()
        .filter(|r| !r.trim().is_empty())
        .unwrap_or("Sending a message in a honeypot channel");

    let duration = honeypot.duration.map(Duration::from_millis);
    let honeypot_dm_settings = config.moderation_dms.as_ref().and_then(|m| m.honeypot.as_ref());
    let gctx = get_guild_ctx(guild_id, ctx).await?;

    insert_automod_log(
        &data.db,
        guild_id.get() as i64,
        message.author.id.get() as i64,
        None, None, "Honeypot", None,
        Some(&message.content), &["ban"], ""
    ).await?;

    send_mod_dm!(
        &ctx.http,
        &message.author,
        honeypot_dm_settings,
        "honeypot",
        |text| replace_user_placeholders(text, &gctx, &message.author),
        CreateEmbed::new()
            .title(format!("You have been banned from {}", gctx.name))
            .color(0xFF4747)
            .field("Reason", reason, false)
            .thumbnail(&gctx.icon_url)
            .footer(CreateEmbedFooter::new(MODERATION_FOOTER))
    );

    guild_id.ban_with_reason(&ctx, &message.author, dmd, reason).await?;

    if let Some(dur) = duration {
        schedule_unban(&data.db, guild_id, &message.author, dur).await?;
    }

    Ok(true)
}