use crate::core::config::GuildCtx;
use crate::events::handlers::join_leave::message;
use crate::types::config::welcome::WelcomeConfig;
use crate::types::Error;
use serenity::all::{ChannelId, GuildChannel};
use tracing::{debug, trace, warn};

/// Assembles and sends the public welcome message to the designated channel.
pub async fn send_public_welcome(
    ctx: &serenity::all::Context,
    member: &serenity::all::Member,
    config: &WelcomeConfig,
    context_channel: &GuildChannel,
    gctx: &GuildCtx,
    warning_text: &str,
) -> Result<(), Error> {
    let guild_id = member.guild_id.get();
    let user_id = member.user.id.get();

    let Some(public) = config.public.as_ref().filter(|p| p.enabled.unwrap_or(false)) else {
        return Ok(());
    };

    let Some(ch_str) = public.channel_id.as_ref().and_then(|id| id.parse::<u64>().ok()) else {
        return Ok(());
    };

    let channel_id = ChannelId::new(ch_str);
    trace!(guild_id, user_id, target_channel = ch_str, "Assembling public welcome message layout");

    match message::build_welcome_message(public, member, context_channel, gctx, warning_text, false) {
        Ok(builder) => {
            if let Err(e) = channel_id.send_message(&ctx.http, builder).await {
                warn!(error = ?e, guild_id, user_id, target_channel = ch_str, "Failed to send public welcome message to channel");
            } else {
                debug!(guild_id, user_id, target_channel = ch_str, "Public welcome message sent successfully");
            }
        }
        Err(e) => {
            warn!(error = ?e, guild_id, user_id, "Failed to compile public welcome layout template");
        }
    }

    Ok(())
}

/// Assembles and sends the welcome message directly to the member's DMs.
pub async fn send_private_welcome(
    ctx: &serenity::all::Context,
    member: &serenity::all::Member,
    config: &WelcomeConfig,
    context_channel: &GuildChannel,
    gctx: &GuildCtx,
    warning_text: &str,
) -> Result<(), Error> {
    let guild_id = member.guild_id.get();
    let user_id = member.user.id.get();

    let Some(private) = config.private.as_ref().filter(|p| p.enabled.unwrap_or(false)) else {
        return Ok(());
    };

    trace!(guild_id, user_id, "Establishing private DM context for welcome message");
    match member.user.create_dm_channel(&ctx.http).await {
        Ok(dm_channel) => {
            match message::build_welcome_message(private, member, context_channel, gctx, warning_text, true) {
                Ok(builder) => {
                    if let Err(e) = dm_channel.send_message(&ctx.http, builder).await {
                        warn!(error = ?e, guild_id, user_id, "Failed to send private DM welcome message to user");
                    } else {
                        debug!(guild_id, user_id, "Private DM welcome message sent successfully");
                    }
                }
                Err(e) => {
                    warn!(error = ?e, guild_id, user_id, "Failed to compile private DM welcome layout template");
                }
            }
        }
        Err(e) => {
            warn!(error = ?e, guild_id, user_id, "Failed to establish DM channel with newly joined user");
        }
    }

    Ok(())
}