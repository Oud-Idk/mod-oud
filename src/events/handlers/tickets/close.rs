use crate::events::handlers::tickets::{cache, database};
use crate::types::{Data, Error};
use fred::clients::Client;
use fred::prelude::{KeysInterface, PubsubInterface, SetsInterface};
use poise::serenity_prelude as serenity;
use serenity::all::{
    ChannelId, ComponentInteraction, Context, CreateInteractionResponse,
    CreateInteractionResponseMessage, CreateMessage,
};
use std::time::Duration;
use tracing::{debug, info, instrument, warn};

#[instrument(skip(ctx, data), fields(channel_id = %component.channel_id, user_id = %component.user.id
))]
pub async fn on_close_ticket(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    debug!("Ticket close request received from button interaction");

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
    debug!("Sending deletion countdown warning to channel");
    channel_id
        .send_message(
            &ctx.http,
            CreateMessage::default().content("Closing ticket and deleting channel in 5 seconds..."),
        )
        .await?;

    tokio::time::sleep(Duration::from_secs(5)).await;

    info!(channel_id = %channel_id, "Deleting ticket channel from guild");
    if let Err(e) = channel_id.delete(&ctx.http).await {
        warn!(error = %e, "Could not delete channel from Discord; it might have been deleted manually");
    }

    Ok(())
}

#[instrument(skip(data))]
async fn cleanup_ticket_records(data: &Data, channel_id: ChannelId) -> Result<(), Error> {
    let channel_id_str = channel_id.get().to_string();
    debug!("Starting database and cache cleanup for ticket channel");

    database::mark_ticket_as_closed_db(&data, channel_id).await?;
    debug!("Database status updated to CLOSED");

    let redis = &data.redis;

    cache::mark_ticket_as_closed_redis(channel_id, &channel_id_str, redis).await?;

    debug!("Evicting ticket from local active cache");
    data.active_tickets.remove(&channel_id.get()).await;

    info!("Database and cache records cleaned up successfully");
    Ok(())
}