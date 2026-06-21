use crate::core::config::get_settings;
use crate::events::handlers::levels::levels_text;
use crate::events::handlers::message_logging::cache::cache_message_in_redis;
use crate::events::handlers::message_logging::handlers::{message_log_delete, message_log_update};
use crate::events::handlers::starboard::starboard::{handle_starboard_reaction_add, handle_starboard_reaction_remove};
use crate::events::handlers::{message_filter, starboard, tickets};
use crate::types::{Data, Error};
use serenity::all::{ChannelId, Context, GuildId, Message, MessageId, MessageUpdateEvent, Reaction};

pub async fn on_message(ctx: &Context, message: &Message, data: &Data) -> Result<(), Error> {
    if message.author.bot {
        return Ok(());
    }

    let Some(guild_id) = message.guild_id else {
        return Ok(());
    };

    let guild_id_i64 = guild_id.get() as i64;
    let config = get_settings(&data.db, &data.redis, &data.guild_configs, guild_id_i64).await?;

    let is_enabled = config.message_logging
        .as_ref()
        .and_then(|v| v.enabled)
        .unwrap_or(false);

    if is_enabled {
        let redis_conn = data.redis.clone();
        let msg_clone = message.clone();

        tokio::spawn(async move {
            if let Err(e) = cache_message_in_redis(&redis_conn, &msg_clone).await {
                tracing::error!("Failed to cache message in Redis: {}", e);
            }
        });
    }

    let was_filtered = message_filter::handle_filtering(ctx, data, &config, message).await?;
    if was_filtered {
        // Prevent deleted/filtered messages from affecting tickets or awarding XP
        return Ok(());
    }

    tickets::handle_tickets(ctx, message, data, &config).await?;
    levels_text::handle_leveling(ctx, message, data, config.leveling).await?;

    Ok(())
}

pub async fn on_message_delete(
    ctx: &Context,
    channel_id: &ChannelId,
    deleted_message_id: &MessageId,
    guild_id: &Option<GuildId>,
    data: &Data,
) -> Result<(), Error> {
    starboard::handle_cleanup_if_starboard(&ctx, &data.db, deleted_message_id).await?;
    message_log_delete(ctx, channel_id, deleted_message_id, guild_id, data).await?;
    Ok(())
}

pub async fn on_message_update(
    ctx: &Context,
    old_if_available: Option<&Message>,
    new: Option<&Message>,
    event: &MessageUpdateEvent,
    _data: &Data,
) -> Result<(), Error> {
    message_log_update(ctx, old_if_available, new, event, _data).await?;

    Ok(())
}

pub async fn on_reaction_add(ctx: &Context, add_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    handle_starboard_reaction_add(ctx, add_reaction, data).await?;
    Ok(())
}

pub async fn on_reaction_remove(ctx: &Context, removed_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    handle_starboard_reaction_remove(ctx, removed_reaction, data).await?;
    Ok(())
}