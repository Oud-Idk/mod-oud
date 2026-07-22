use crate::core::config::get_guild_ctx;
use crate::events::handlers::levels::effects;
use crate::shared::embed::build_custom_message;
use crate::shared::placeholders::replace_level_notify_placeholder;
use crate::types::config::config::Format;
use crate::types::config::leveling::LevelingConfig;
use crate::types::embed::DiscordEmbed;
use crate::types::leveling::UserLevel;
use crate::types::Error;
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

    let gctx = get_guild_ctx(*guild_id, ctx.http.as_ref()).await?;
    let author = &message.author;

    let custom_message_opt = build_custom_message(
        &config.notify.format,
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

    effects::send_according_to_config(&ctx, message.channel_id, config, author, msg).await?;

    Ok(())
}