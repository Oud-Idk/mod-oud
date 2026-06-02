use crate::{
    event_handlers::handlers::join_leave::{on_member_join, on_member_leave}, Data,
    Error,
};
use poise::serenity_prelude as serenity;
use poise::serenity_prelude::FullEvent;
use crate::event_handlers::interact::on_interact;
use crate::event_handlers::message::{on_message, on_message_delete, on_message_update};

pub async fn event_handler(
    ctx: &serenity::Context,
    event: &FullEvent,
    _framework: poise::FrameworkContext<'_, Data, Error>,
    data: &Data,
) -> Result<(), Error> {
    match event {
        FullEvent::MessageDelete {
            channel_id,
            deleted_message_id,
            guild_id,
        } => {
            on_message_delete(ctx, channel_id, deleted_message_id, guild_id, data).await?;
        }
        FullEvent::MessageUpdate {
            old_if_available,
            new,
            event,
        } => {
            on_message_update(ctx, old_if_available.as_ref(), new.as_ref(), event, data).await?;
        }
        FullEvent::GuildMemberAddition { new_member } => {
            on_member_join(ctx, new_member, data).await?;
        }
        FullEvent::GuildMemberRemoval {
            guild_id,
            user,
            member_data_if_available,
        } => {
            on_member_leave(ctx, guild_id, user, member_data_if_available, data).await?;
        }
        FullEvent::Message { new_message } => {
            on_message(ctx, new_message, data).await?;
        }
        FullEvent::InteractionCreate { interaction } => {
            on_interact(ctx, interaction, data).await?;
        }
        _ => {}
    }
    Ok(())
}
