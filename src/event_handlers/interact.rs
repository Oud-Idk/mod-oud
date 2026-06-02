use poise::serenity_prelude as serenity;
use serenity::all::Interaction;
use crate::{Data, Error};
use crate::event_handlers::handlers::tickets;
pub async fn on_interact(
    ctx: &serenity::Context,
    interaction: &Interaction,
    data: &Data,
) -> Result<(), Error> {
    let Interaction::Component(component) = interaction else {
        return Ok(());
    };

    match component.data.custom_id.as_str() {
        "open_ticket" => {tickets::on_open_ticket(ctx, component, data).await?;},
        "close_ticket" => {tickets::on_close_ticket(ctx, component).await?},
        _ => return Ok(()),
    }

    Ok(())
}