use crate::core::config::guild_ctx::get_guild_ctx;
use crate::features::leveling::placeholders::replace_level_notify_placeholder;
use crate::features::leveling::types::{LevelingConfig, NotificationTarget, UserLevel};
use crate::shared::embed::build_custom_message;
use anyhow::Result;
use serenity::all::{ChannelId, Context, CreateMessage, GuildId, User};
use tracing::{warn, debug, trace};

pub async fn send_according_to_config(
    ctx: &Context,
    current_channel_id: ChannelId,
    config: &LevelingConfig,
    author: &User,
    msg: CreateMessage,
) -> Result<()> {
    match config.notify.target {
        NotificationTarget::CurrentChannel => {
            current_channel_id.send_message(&ctx.http, msg).await?;
        }
        NotificationTarget::SpecifiedChannel { channel_id } => {
            // channel_id is guaranteed to be here by the type system!
            channel_id.send_message(&ctx.http, msg).await?;
        }
        NotificationTarget::Dm => {
            if let Err(e) = author.dm(&ctx.http, msg).await {
                warn!(
                    error = ?e,
                    user_id = %author.id,
                    "level-up DM not sent; notification dropped"
                );
            }
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
            fallback = "default layout",
            "custom level-up layout compilation failed"
        );
            None
        });

    let msg = custom_message_opt.unwrap_or_else(|| {
        debug!(
            %guild_id,
            user_id = %user_id,
            fallback = "default announcement",
            "level-up announcement"
        );
        let content = format!(
            "Congratulations, <@{user_id}>. You have leveled up to **level {current_level}**",
        );
        CreateMessage::new().content(content)
    });

    send_according_to_config(ctx, event.channel_id, config, &event.author, msg).await?;

    trace!(
        %guild_id,
        user_id = %user_id,
        current_level,
        "level-up notification sent"
    );

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
            fallback = "default layout",
            "custom voice level-up layout construction failed"
        );
            None
        });

    let msg = custom_message_opt.unwrap_or_else(|| {
        debug!(
            %guild_id,
            fallback = "default announcement",
            "voice level-up announcement"
        );
        let content = format!(
            "Congratulations, <@{}>. You have leveled up to **level {}**",
            user.id, user_level.current_level
        );
        CreateMessage::new().content(content)
    });

    send_according_to_config(ctx, voice_channel_id, config, user, msg).await?;

    trace!(
        %guild_id,
        user_id = %user.id,
        current_level = user_level.current_level,
        "voice level-up notification sent"
    );

    Ok(())
}