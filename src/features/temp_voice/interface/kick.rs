use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice::interface::{
    create_ephemeral_msg, get_input_value, preflight_button_check, preflight_modal_check,
};
use crate::features::temp_voice::service;
use serenity::all::{
    ComponentInteraction, Context, CreateActionRow, CreateInputText, CreateInteractionResponse,
    CreateModal, InputTextStyle, ModalInteraction,
};
use tracing::debug;

pub async fn handle_kick_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    let Ok(Some((_, _))) = preflight_button_check(ctx, interaction, data).await else {
        return Ok(());
    }; // Verify the user is in the guild and in a voice channel

    debug!("Showing kick modal");

    let input = CreateInputText::new(InputTextStyle::Short, "User to kick", "user_to_kick")
        .placeholder("Enter username, nickname, or User ID")
        .required(true);

    let modal = CreateModal::new("temp_voice_kick_modal", "Kick from Voice Channel")
        .components(vec![CreateActionRow::InputText(input)]);

    interaction
        .create_response(&ctx.http, CreateInteractionResponse::Modal(modal))
        .await?;
    Ok(())
}
pub async fn handle_kick_temp_vc_submit(
    ctx: &Context,
    interaction: &ModalInteraction,
    data: &BotData,
) -> Result<(), Error> {
    let Some((channel_id, guild_id)) = preflight_modal_check(ctx, interaction, data).await? else {
        return Ok(());
    };

    let query_raw = get_input_value(interaction, "user_to_kick").unwrap_or_default();
    let response_message =
        service::kick_user_by_query(ctx, guild_id, channel_id, &query_raw).await?;

    interaction
        .create_response(&ctx.http, create_ephemeral_msg(&response_message))
        .await?;

    Ok(())
}
