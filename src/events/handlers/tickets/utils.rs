use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{ComponentInteraction, CreateInteractionResponse, CreateInteractionResponseMessage};

pub fn is_ticket_active(data: &Data, channel_id: u64) -> bool {
    data.active_tickets.contains_key(&channel_id)
}

pub async fn send_missing_config_error(ctx: &serenity::Context, component: &ComponentInteraction) -> Result<(), Error> {
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new()
                    .content("❌ Tickets cannot be opened because the staff role has not been configured by an administrator.")
                    .ephemeral(true),
            ),
        )
        .await?;
    Ok(())
}

pub async fn send_disabled_error(ctx: &serenity::Context, component: &ComponentInteraction) -> Result<(), Error> {
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new()
                    .content("❌ Tickets are currently disabled in this guild.")
                    .ephemeral(true),
            ),
        )
        .await?;
    Ok(())
}