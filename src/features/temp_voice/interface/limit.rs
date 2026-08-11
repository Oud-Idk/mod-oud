use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice::interface::{create_ephemeral_msg, preflight_button_check, preflight_modal_check};
use crate::features::temp_voice::service;
use serenity::all::{ComponentInteraction, Context, CreateActionRow, CreateInputText, CreateInteractionResponse, CreateModal, InputTextStyle, ModalInteraction};
use tracing::{debug, trace};

pub(crate) async fn handle_set_limit_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    let Ok(Some((_, _))) = preflight_button_check(
        &ctx, interaction, data
    ).await else {
        return Ok(())
    }; // same deal here. Preflight so the user doesn't rename when disconnected.

    debug!("Showing limit modal");

    let input = CreateInputText::new(
        InputTextStyle::Short, "New voice channel limit", "new_limit"
    )
        .placeholder("From 1 to 99. Leave blank to reset.")
        .required(false);

    let modal = CreateModal::new(
        "temp_voice_limit_modal",
        "Limit Voice Channel",
    )
        .components(vec![CreateActionRow::InputText(input)]);

    interaction.create_response(&ctx.http, CreateInteractionResponse::Modal(modal)).await?;
    Ok(())
}

pub(crate) async fn handle_set_limit_vc_submit(
    ctx: &Context,
    interaction: &ModalInteraction,
    data: &BotData,
) -> Result<(), Error> {
    let Some((channel_id, _)) = preflight_modal_check(&ctx, interaction, data).await? else {
        return Ok(());
    };

    trace!("Handling limit submit");

    let limit_raw = crate::features::temp_voice::interface::get_input_value(&interaction, "new_limit").unwrap();
    let response_message = service::set_temp_vc_limit(ctx, channel_id, &limit_raw).await?;

    interaction.create_response(&ctx, create_ephemeral_msg(&response_message)).await?;

    Ok(())
}