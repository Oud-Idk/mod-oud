use crate::features::{reaction_roles, tickets};
use crate::features::{temp_voice, verification};

use crate::core::config::state::BotData;
use anyhow::Result;
use poise::serenity_prelude as serenity;
use serenity::all::Interaction;
use tracing::debug;

/// A wrapper for button interactions and modal interactions
///
/// # Errors
/// Propagates error from features to here.
pub async fn on_interact(
    ctx: &serenity::Context,
    interaction: &Interaction,
    data: &BotData,
) -> Result<()> {
    match interaction {
        Interaction::Component(component) => {
            debug!(
                id = component.data.custom_id.as_str(),
                "Got component interaction"
            );

            let custom_id = component.data.custom_id.as_str();

            if custom_id.starts_with("temp_voice_") {
                temp_voice::handle_interaction(ctx, interaction, data).await?;
                return Ok(());
            }

            if custom_id.starts_with("btn_") {
                reaction_roles::handle_button_interaction(ctx, component, data).await?;
                return Ok(());
            }

            match custom_id {
                "open_ticket" => tickets::on_open_ticket(ctx, component, data).await?,
                "close_ticket" => tickets::on_close_ticket(ctx, component, data).await?,
                "verify" => verification::send_verification_link(ctx, data, component).await?,
                _ => {}
            }
        }
        Interaction::Modal(modal) => {
            debug!(id = modal.data.custom_id.as_str(), "Got modal interaction");
            let custom_id = modal.data.custom_id.as_str();

            if custom_id.starts_with("temp_voice_") {
                temp_voice::handle_interaction(ctx, interaction, data).await?;
            }
        }
        _ => {}
    }

    Ok(())
}
