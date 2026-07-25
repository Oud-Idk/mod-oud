use crate::features::verification::generate_verification_link;
use crate::shared::store_username_relation;

use crate::features::{reaction_roles, tickets};
use crate::features::{temp_voice};

use crate::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::Interaction;
use tracing::{debug, warn};

pub async fn on_interact(
    ctx: &serenity::Context,
    interaction: &Interaction,
    data: &Data,
) -> Result<(), Error> {
    match interaction {
        Interaction::Component(component) => {
            debug!(id = component.data.custom_id.as_str(), "Got component interaction");
            store_username_relation(&data.db, &data.redis, component.user.id.get(), &component.user.name).await?;

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

                "verify" => {
                    let Some(guild_id) = component.guild_id else {
                        return Ok(());
                    };
                    let Some(shared_secret) = data.shared_secret.as_deref() else {
                        warn!("Shared secret not set up for verification");
                        return Ok(());
                    };
                    let verification_link = generate_verification_link(
                        component.user.id.get(),
                        guild_id.get(),
                        shared_secret.as_bytes(),
                        data.domain.as_str(),
                    );

                    // Reusing our ephemeral reply helper!
                    component
                        .create_response(
                            &ctx.http,
                            serenity::CreateInteractionResponse::Message(
                                serenity::CreateInteractionResponseMessage::new()
                                    .content(format!("Please go to this link to verify: {}", verification_link))
                                    .ephemeral(true),
                            ),
                        )
                        .await?;
                }
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