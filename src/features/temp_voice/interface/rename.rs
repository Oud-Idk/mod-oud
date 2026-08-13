use poise::serenity_prelude as serenity;
use serenity::all::{ComponentInteraction, Context, CreateActionRow, CreateInputText, CreateInteractionResponse, CreateModal, InputTextStyle, ModalInteraction};

use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice::interface::{create_ephemeral_msg, get_new_name, preflight_button_check, preflight_modal_check};
use crate::features::temp_voice::service;
use tracing::debug;

pub async fn handle_rename_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    let Ok(Some(_)) = preflight_button_check(
        ctx, interaction, data
    ).await else {
        return Ok(())
    }; // To make sure user is in a guild and in a voice chat

    debug!("Showing rename modal");

    let input = CreateInputText::new(
        InputTextStyle::Short, "New channel name", "new_name"
    )
        .placeholder("e.g. Late Night Grind. Leave blank to reset.")
        .max_length(100)
        .required(false);


    let modal = CreateModal::new(
        "temp_voice_rename_modal",
        "Rename Voice Channel",
    )
        .components(vec![CreateActionRow::InputText(input)]);

    interaction.create_response(&ctx.http, CreateInteractionResponse::Modal(modal)).await?;
    Ok(())
}

pub async fn handle_rename_temp_vc_submit(
    ctx: &Context,
    interaction: &ModalInteraction,
    data: &BotData,
) -> Result<(), Error> {
    let Some((channel_id, guild_id)) = preflight_modal_check(ctx, interaction, data).await? else {
        return Ok(());
    };
    let Some(member) = interaction.member.as_ref() else { return Ok(()); };
    let raw_input = get_new_name(interaction).unwrap_or_default();

    let response_message = service::rename_temp_vc(
        ctx,
        &data.core.redis,
        &data.core.db,
        guild_id,
        channel_id,
        member,
        &raw_input,
    ).await?;

    interaction
        .create_response(&ctx.http, create_ephemeral_msg(&response_message))
        .await?;

    Ok(())
}

pub const fn is_rate_limited(err: &serenity::http::HttpError) -> bool {
    matches!(
        err,
        serenity::http::HttpError::UnsuccessfulRequest(resp) if resp.status_code.as_u16() == 429,
    )
}