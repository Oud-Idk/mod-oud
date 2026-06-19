use crate::core::config::get_settings;
use crate::events::handlers::levels::levels_text;
use crate::events::handlers::message_logging::cache::cache_message_in_redis;
use crate::events::handlers::message_logging::handlers::{message_log_delete, message_log_update};
use crate::events::handlers::starboard::starboard::{handle_starboard_reaction_add, handle_starboard_reaction_remove};
use crate::events::handlers::{message_filter, tickets};
use crate::types::{Data, Error};
use serenity::all::{ChannelId, Context, GuildId, Message, MessageId, MessageUpdateEvent, Reaction};

pub async fn on_message(ctx: &Context, message: &Message, data: &Data) -> Result<(), Error> {
    if message.author.bot {
        return Ok(());
    }

    let Some(guild_id) = message.guild_id else {
        return Ok(());
    };

    let _ = cache_message_in_redis(&data.redis, message).await;
    let guild_id_i64 = guild_id.get() as i64;
    let config = get_settings(&data.db, &data.redis, guild_id_i64).await?;

    message_filter::handle_filtering(&ctx, &data, &config, &message).await?;
    tickets::handle_tickets(ctx, message, data).await?;
    levels_text::handle_leveling(ctx, message, data, config.leveling).await?;

    Ok(())
}

pub async fn on_message_delete(
    ctx: &Context,
    channel_id: &ChannelId,
    deleted_message_id: &MessageId,
    guild_id: &Option<GuildId>,
    _data: &Data,
) -> Result<(), Error> {
    message_log_delete(ctx, channel_id, deleted_message_id, guild_id, _data).await?;
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