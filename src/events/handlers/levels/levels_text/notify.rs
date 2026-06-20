use crate::core::config::get_guild_ctx;
use crate::events::handlers::levels::effects;
use crate::events::handlers::levels::levels_text::UserLevel;
use crate::types::config::config::Format;
use crate::types::config::leveling::LevelingConfig;
use crate::types::embed::DiscordEmbed;
use crate::types::Error;
use crate::utils::custom_msg::build_custom_message;
use crate::utils::placeholders::replace_level_notify_placeholder;
use serenity::all::{Context, CreateMessage, GuildId, Message};
use tracing::{debug, trace, warn};

pub async fn send_message(
    ctx: &Context,
    embed: Option<&DiscordEmbed>,
    message: &Message,
    user_level: &UserLevel,
    config: &LevelingConfig,
    guild_id: &GuildId,
    previous_level: i32,
) -> Result<(), Error> {
    let guild_id_u64 = guild_id.get();
    let user_id = &user_level.user_id;

    trace!(
        guild_id = guild_id_u64,
        user_id = %user_id,
        current_level = user_level.current_level,
        "Initiating level up notification sequence"
    );

    let is_embed = matches!(config.notify.format, Format::Embed);
    let gctx = get_guild_ctx(*guild_id, ctx.http.as_ref()).await?;
    let author = &message.author;

    let custom_message_opt = build_custom_message(
        is_embed,
        Some(&config.notify.content),
        embed,
        |text| {
            replace_level_notify_placeholder(
                text,
                &gctx,
                &author,
                user_level.current_level,
                previous_level,
            )
        }
    ).unwrap_or_else(|e| {
        warn!(
            error = ?e,
            guild_id = guild_id_u64,
            user_id = %user_id,
            "Failed to compile custom level-up layout; using standard fallback"
        );
        None
    });

    let msg = custom_message_opt.unwrap_or_else(|| {
        debug!(
            guild_id = guild_id_u64,
            user_id = %user_id,
            "Using fallback level-up announcement string"
        );
        let content = format!("Congratulations, <@{}>. You have leveled up to **level {}**", user_level.user_id, user_level.current_level);
        CreateMessage::new().content(content)
    });

    trace!(
        guild_id = guild_id_u64,
        user_id = %user_id,
        "Sending announcement message according to notification scope configuration"
    );
    effects::send_according_to_config(&ctx, message.channel_id, config, author, msg).await?;

    Ok(())
}