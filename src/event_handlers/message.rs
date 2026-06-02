use crate::event_handlers::handlers::{message_filter, message_logging, tickets};
use crate::{Data, Error};
use serenity::all::{ChannelId, Context, GuildId, Message, MessageId, MessageUpdateEvent};

pub async fn on_message(ctx: &Context, message: &Message, data: &Data) -> Result<(), Error> {
    if message.author.bot {
        return Ok(());
    }

    let Some(guild_id) = message.guild_id else {
        return Ok(());
    };

    let author_id = message.author.id.get();
    let guild_id_u64 = guild_id.get();

    let was_spam =
        message_filter::handle_spam_prevention(ctx, message, data, guild_id_u64, author_id).await?;
    if was_spam {
        return Ok(());
    }

    message_filter::process_moderation_filters(ctx, message, data, guild_id).await?;
    tickets::handle_tickets(ctx, message, data).await?;

    Ok(())
}

pub async fn on_message_delete(
    ctx: &Context,
    channel_id: &ChannelId,
    deleted_message_id: &MessageId,
    guild_id: &Option<GuildId>,
    _data: &Data,
) -> Result<(), Error> {
    message_logging::message_log_delete(ctx, channel_id, deleted_message_id, guild_id, _data)
        .await?;
    Ok(())
}

pub async fn on_message_update(
    ctx: &Context,
    old_if_available: Option<&Message>,
    new: Option<&Message>,
    event: &MessageUpdateEvent,
    _data: &Data,
) -> Result<(), Error> {
    message_logging::message_log_update(ctx, old_if_available, new, event, _data).await?;

    Ok(())
}
