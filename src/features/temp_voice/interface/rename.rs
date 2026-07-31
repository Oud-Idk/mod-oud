use crate::features::temp_voice::database::get_hub_info_by_category;
use crate::features::temp_voice::placeholders::replace_channel_placeholders;
use fred::interfaces::KeysInterface;
use poise::serenity_prelude as serenity;
use serenity::all::{Channel, ChannelId, ComponentInteraction, Context, CreateActionRow, CreateInputText, CreateInteractionResponse, CreateModal, EditChannel, InputTextStyle, ModalInteraction};

use crate::features::temp_voice::interface::{create_ephemeral_msg, get_new_name, preflight_button_check, preflight_modal_check};
use crate::{Data, Error};
use tracing::{debug, trace, warn};
use crate::features::temp_voice::service;

pub(crate) async fn handle_rename_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Ok(Some(_)) = preflight_button_check(
        &ctx, interaction, data
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

pub(crate) async fn handle_rename_temp_vc_submit(
    ctx: &Context,
    interaction: &ModalInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Some((channel_id, guild_id)) = preflight_modal_check(&ctx, interaction, data).await? else {
        return Ok(());
    };
    let Some(member) = interaction.member.as_ref() else { return Ok(()); };
    let raw_input = get_new_name(interaction).unwrap_or_default();

    let response_message = service::rename_temp_vc(
        &ctx,
        &data.redis,
        &data.db,
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

pub fn is_rate_limited(err: &serenity::http::HttpError) -> bool {
    matches!(
        err,
        serenity::http::HttpError::UnsuccessfulRequest(resp) if resp.status_code.as_u16() == 429,
    )
}