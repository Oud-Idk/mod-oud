use crate::core::config::state::{BotData, Error};
use crate::features::tickets::{audit, cache, database};
use serenity::all::{
    ChannelId, ComponentInteraction, Context, CreateInteractionResponse,
    CreateInteractionResponseMessage, CreateMessage,
};
use std::time::Duration;
use tracing::{debug, instrument, warn};

/// Handles the close-ticket button interaction by purging ticket records and deleting the channel after a countdown.
///
/// # Errors
/// Returns an error if the interaction response, ticket cleanup, or channel
/// deletion fails.
#[instrument(skip(ctx, data, component), fields(channel_id = %component.channel_id, user_id = %component.user.id
))]
pub async fn on_close_ticket(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Defer(CreateInteractionResponseMessage::default()),
        )
        .await?;

    let channel_id = component.channel_id;

    // Purge records from database and redis
    cleanup_ticket_records(data, channel_id).await?;

    // Deletion countdown warning
    channel_id
        .send_message(
            &ctx.http,
            CreateMessage::default().content("Closing ticket and deleting channel in 5 seconds..."),
        )
        .await?;
    debug!(%channel_id, "deletion countdown notice sent to the ticket channel");

    tokio::time::sleep(Duration::from_secs(5)).await;

    if let Some(guild_id) = component.guild_id {
        audit::ticket_closed(guild_id, channel_id, Some(component.user.id), "user_closed");
    }

    if let Err(e) = channel_id.delete(&ctx.http).await {
        warn!(
            error = %e,
            "ticket channel not deleted; it may already have been removed"
        );
    }

    Ok(())
}

#[instrument(skip(data))]
async fn cleanup_ticket_records(data: &BotData, channel_id: ChannelId) -> Result<(), Error> {
    let channel_id_str = channel_id.get().to_string();

    database::mark_ticket_as_closed_db(data, channel_id).await?;
    debug!(%channel_id, "ticket status set to closed in the database");

    let redis = &data.core.redis;

    cache::mark_ticket_as_closed_redis(channel_id, &channel_id_str, redis).await?;

    data.caches.active_tickets.remove(&channel_id).await;

    Ok(())
}
