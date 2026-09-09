use crate::core::config::guild_ctx::GuildCtx;
use crate::core::config::state::Error;
use crate::features::join_leave::image::generate_welcome_card;
use crate::features::join_leave::messages;
use crate::features::join_leave::types::{WelcomeConfig, WelcomeImageStyle};
use serenity::all::{Context, CreateAttachment, CreateMessage, GuildChannel, Member};
use tracing::{debug, trace, warn};

/// Attaches the generated welcome card when `send_image` is on.
async fn maybe_attach_welcome_card(
    builder: CreateMessage,
    send_image: bool,
    style: &WelcomeImageStyle,
    member: &Member,
    gctx: &GuildCtx,
) -> CreateMessage {
    if !send_image {
        return builder;
    }

    let display_name = member
        .user
        .global_name
        .as_deref()
        .unwrap_or(&member.user.name);

    let bytes = generate_welcome_card(
        display_name,
        &member.user.face(),
        gctx.member_count,
        &gctx.name,
        style,
    )
        .await;

    match bytes {
        Some(bytes) => builder.add_file(CreateAttachment::bytes(bytes, "welcome.png")),
        None => {
            warn!("Skipping welcome image attachment; sending text/embed only");
            builder
        }
    }
}

/// Assembles and sends the public welcome message to the designated channel.
pub async fn send_public_welcome(
    ctx: &Context,
    member: &Member,
    config: &WelcomeConfig,
    context_channel: &GuildChannel,
    gctx: &GuildCtx,
    warning_text: &str,
) -> Result<(), Error> {
    let guild_id = member.guild_id;
    let user_id = member.user.id;

    let Some(public) = config.public.as_ref().filter(|p| p.enabled.unwrap_or(false)) else {
        return Ok(());
    };

    let Some(channel_id) = public.channel_id else {
        warn!("Channel ID for welcome is somehow empty!");
        return Ok(());
    };

    trace!(%guild_id, %user_id, %channel_id, "Assembling public welcome message layout");

    let builder = match messages::build_welcome_message(
        public,
        member,
        context_channel,
        gctx,
        warning_text,
        false,
    ) {
        Ok(b) => b,
        Err(e) => {
            warn!(error = ?e, %guild_id, %user_id, "Failed to compile public welcome layout template");
            return Ok(());
        }
    };

    let builder = maybe_attach_welcome_card(
        builder,
        public.send_image,
        &public.image_style,
        member,
        gctx,
    )
        .await;

    if let Err(e) = channel_id.send_message(&ctx.http, builder).await {
        warn!(error = ?e, %guild_id, %user_id, target_channel = %channel_id, "Failed to send public welcome message to channel");
    } else {
        debug!(%guild_id, %user_id, target_channel = %channel_id, "Public welcome message sent successfully");
    }

    Ok(())
}

/// Assembles and sends the welcome message directly to the member's DMs.
pub async fn send_private_welcome(
    ctx: &Context,
    member: &Member,
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

    let dm_channel = match member.user.create_dm_channel(&ctx.http).await {
        Ok(ch) => ch,
        Err(e) => {
            warn!(error = ?e, guild_id, user_id, "Failed to establish DM channel with newly joined user");
            return Ok(());
        }
    };

    let builder = match messages::build_welcome_message(
        private,
        member,
        context_channel,
        gctx,
        warning_text,
        true,
    ) {
        Ok(b) => b,
        Err(e) => {
            warn!(error = ?e, guild_id, user_id, "Failed to compile private DM welcome layout template");
            return Ok(());
        }
    };

    let builder = maybe_attach_welcome_card(
        builder,
        private.send_image,
        &private.image_style,
        member,
        gctx,
    )
        .await;

    if let Err(e) = dm_channel.send_message(&ctx.http, builder).await {
        warn!(error = ?e, guild_id, user_id, "Failed to send private DM welcome message to user");
    } else {
        debug!(guild_id, user_id, "Private DM welcome message sent successfully");
    }

    Ok(())
}