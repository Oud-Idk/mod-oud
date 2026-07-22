use crate::events::handlers::temp_voice::interface;
use crate::events::handlers::temp_voice::interface::utils::create_ephemeral_msg;
use crate::events::handlers::tickets;
use crate::types::{Data, Error};
use crate::utils::store_username_relation;
use crate::utils::verification::generate_verification_link;
use poise::serenity_prelude as serenity;
use serenity::all::{ComponentInteractionDataKind, Interaction};
use tracing::{debug, warn};

pub async fn on_interact(
    ctx: &serenity::Context,
    interaction: &Interaction,
    data: &Data,
) -> Result<(), Error> {
    match interaction {
        Interaction::Component(component) => {
            // TODO add button reaction roles here
            debug!(id = component.data.custom_id.as_str(), "Got component interaction");

            store_username_relation(&data.db, &data.redis, component.user.id.get(), &component.user.name).await?;

            match component.data.custom_id.as_str() {
                "open_ticket" => tickets::on_open_ticket(ctx, component, data).await?,
                "close_ticket" => tickets::on_close_ticket(ctx, component, data).await?,

                "temp_voice_rename" => interface::rename::handle_rename_temp_vc(ctx, component, data).await?,
                "temp_voice_limit" => interface::limit::handle_set_limit_vc(ctx, component, data).await?,
                "temp_voice_kick" => interface::kick::handle_kick_temp_vc(ctx, component, data).await?,
                "temp_voice_lock" => interface::lock::handle_lock_temp_vc(ctx, component, data).await?,
                "temp_voice_unlock" => interface::unlock::handle_unlock_temp_vc(ctx, component, data).await?,
                "temp_voice_trust" => interface::trust::handle_trust_temp_vc(ctx, component, data).await?,
                "temp_voice_untrust" => interface::untrust::handle_untrust_temp_vc(ctx, component, data).await?,
                "temp_voice_block" => interface::block::handle_block_temp_vc(ctx, component, data).await?,
                "temp_voice_unblock" => interface::unblock::handle_unblock_temp_vc(ctx, component, data).await?,
                "temp_voice_delete" => interface::delete::handle_delete_temp_vc(ctx, component, data).await?,
                "temp_voice_transfer" => interface::transfer::handle_transfer_temp_vc(ctx, component, data).await?,
                "temp_voice_transfer_accept" => interface::transfer_action::handle_accept_transfer(ctx, component, data).await?,
                "temp_voice_transfer_decline" => interface::transfer_action::handle_decline_transfer(ctx, component, data).await?,

                "temp_voice_transfer_select" => {
                    if let ComponentInteractionDataKind::UserSelect { values } = &component.data.kind {
                        interface::transfer::handle_transfer_temp_vc_submit(ctx, component, data, values.clone()).await?;
                    }
                }
                "temp_voice_untrust_select" => {
                    if let ComponentInteractionDataKind::UserSelect { values } = &component.data.kind {
                        interface::untrust::handle_untrust_temp_vc_submit(ctx, component, data, values.clone()).await?;
                    }
                }
                "temp_voice_block_select" => {
                    if let ComponentInteractionDataKind::UserSelect { values } = &component.data.kind {
                        interface::block::handle_block_temp_vc_submit(ctx, component, data, values.clone()).await?;
                    }
                }
                "temp_voice_unblock_select" => {
                    if let ComponentInteractionDataKind::UserSelect { values } = &component.data.kind {
                        interface::unblock::handle_unblock_temp_vc_submit(ctx, component, data, values.clone()).await?;
                    }
                }

                "verify" => {
                    let Some(guild_id) = component.guild_id else {
                        return Ok(());
                    };
                    let Some(shared_secret) = data.shared_secret.as_deref() else {
                        warn!("Shared secret not set up for verification");
                        return Ok(());
                    };
                    let verification_link = generate_verification_link(
                        component.user.id.get(), guild_id.get(),
                        shared_secret.as_bytes(), data.domain.as_str(),
                    );

                    component.create_response(
                        &ctx,
                        create_ephemeral_msg(&format!("Please go to this link to verify: {}", verification_link)),
                    )
                        .await?;

                    return Ok(());
                }

                _ => {}
            }
        },
        Interaction::Modal(modal) => {
            debug!(id = modal.data.custom_id.as_str(), "Got modal interaction");

            match modal.data.custom_id.as_str() {
                "temp_voice_rename_modal" => interface::rename::handle_rename_temp_vc_submit(ctx, modal, data).await?,
                "temp_voice_limit_modal" => interface::limit::handle_set_limit_vc_submit(ctx, modal, data).await?,
                "temp_voice_kick_modal" => interface::kick::handle_kick_temp_vc_submit(ctx, modal, data).await?,
                _ => {},
            }
        }
        _ => {}
    }

    Ok(())
}