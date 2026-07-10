use crate::events::handlers::temp_voice::interface;
use crate::events::handlers::tickets;
use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{ComponentInteractionDataKind, Interaction};
use tracing::debug;

pub async fn on_interact(
    ctx: &serenity::Context,
    interaction: &Interaction,
    data: &Data,
) -> Result<(), Error> {
    match interaction {
        Interaction::Component(component) => {
            debug!(id = component.data.custom_id.as_str(), "Got component interaction");

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