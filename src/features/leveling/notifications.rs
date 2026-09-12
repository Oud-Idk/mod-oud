use crate::core::config::guild_ctx::get_guild_ctx;
use crate::features::leveling::placeholders::replace_level_notify_placeholder;
use crate::features::leveling::types::{LevelingConfig, NotificationTarget, UserLevel};
use crate::shared::embed::build_custom_message;
use anyhow::Result;
use serenity::all::{ChannelId, Context, CreateMessage, GuildId, User};
use tracing::{debug, trace, warn};

pub async fn send_according_to_config(
    ctx: &Context,
    current_channel_id: ChannelId,
    config: &LevelingConfig,
    author: &User,
    msg: CreateMessage,
) -> Result<()> {
    trace!(
        current_channel_id = current_channel_id.get(),
        author_id = author.id.get(),
        "Sending announcement message according to notification scope configuration"
    );

    match config.notify.target {
        NotificationTarget::CurrentChannel => {
            current_channel_id.send_message(&ctx.http, msg).await?;
        }
        NotificationTarget::SpecifiedChannel { channel_id } => {
            // channel_id is guaranteed to be here by the type system!
            channel_id.send_message(&ctx.http, msg).await?;
        }
        NotificationTarget::Dm => {
            let _ = author.dm(&ctx.http, msg).await;
        }
        NotificationTarget::None => {}
    }
    Ok(())
}

pub struct LevelUpEvent {
    pub guild_id: GuildId,
    pub channel_id: ChannelId,
    pub author: User,
    pub user_level: UserLevel,
    pub previous_level: u32,
}

pub async fn send_message(
    ctx: &Context,
    event: &LevelUpEvent,
    config: &LevelingConfig,
) -> Result<()> {
    let guild_id = event.guild_id;
    let user_id = event.user_level.user_id;
    let current_level = event.user_level.current_level;

    trace!(
        %guild_id,
        user_id = %user_id,
        current_level,
        "Initiating level up notification sequence"
    );

    let gctx = get_guild_ctx(guild_id, ctx.http.as_ref()).await?;

    let custom_message_opt = build_custom_message(
        config.notify.message.format,
        &config.notify.message.content,
        &config.notify.message.embed,
        |text| {
            replace_level_notify_placeholder(
                text,
                &gctx,
                &event.author,
                current_level,
                event.previous_level,
            )
        },
    )
        .unwrap_or_else(|e| {
            warn!(
            error = ?e,
            %guild_id,
            user_id = %user_id,
            "Failed to compile custom level-up layout; using standard fallback"
        );
            None
        });

    let msg = custom_message_opt.unwrap_or_else(|| {
        debug!(
            %guild_id,
            user_id = %user_id,
            "Using fallback level-up announcement string"
        );
        let content = format!(
            "Congratulations, <@{user_id}>. You have leveled up to **level {current_level}**",
        );
        CreateMessage::new().content(content)
    });

    send_according_to_config(ctx, event.channel_id, config, &event.author, msg).await?;

    Ok(())
}

pub async fn send_voice_level_up_message(
    ctx: &Context,
    user: &User,
    user_level: &UserLevel,
    config: &LevelingConfig,
    guild_id: GuildId,
    voice_channel_id: ChannelId,
    previous_level: u32,
) -> Result<()> {
    trace!(
        %guild_id,
        "Compiling custom voice level up message"
    );

    let gctx = get_guild_ctx(guild_id, ctx.http.as_ref()).await?;

    let custom_message_opt = build_custom_message(
        config.notify.message.format,
        &config.notify.message.content,
        &config.notify.message.embed,
        |text| {
            replace_level_notify_placeholder(
                text,
                &gctx,
                user,
                user_level.current_level,
                previous_level,
            )
        },
    )
        .unwrap_or_else(|e| {
            warn!(
            error = ?e,
            %guild_id,
            "Failed to construct custom VC level-up layout; using standard fallback"
        );
            None
        });

    let msg = custom_message_opt.unwrap_or_else(|| {
        debug!(
            %guild_id,
            "Using fallback default voice level-up message"
        );
        let content = format!(
            "Congratulations, <@{}>. You have leveled up to **level {}**",
            user.id, user_level.current_level
        );
        CreateMessage::new().content(content)
    });

    send_according_to_config(ctx, voice_channel_id, config, user, msg).await?;

    Ok(())
}