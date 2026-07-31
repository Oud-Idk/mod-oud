use crate::features::temp_voice::interface::{create_ephemeral_msg, preflight_button_check};
use crate::features::temp_voice::service;
use crate::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{
    ButtonStyle, ComponentInteraction, Context, CreateActionRow, CreateButton,
    CreateInteractionResponse, CreateInteractionResponseMessage, CreateMessage, CreateSelectMenu,
    CreateSelectMenuKind, UserId,
};
use tracing::{debug, info, instrument, warn};

#[instrument(skip(ctx, data), fields(user_id = %interaction.user.id.get()))]
pub(crate) async fn handle_transfer_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    debug!("Starting voice channel transfer workflow");

    let Ok(Some(_)) = preflight_button_check(ctx, interaction, data).await else {
        debug!("Preflight check failed or returned no channel information");
        return Ok(());
    };

    let select_menu = CreateSelectMenu::new(
        "temp_voice_transfer_select",
        CreateSelectMenuKind::User { default_users: None },
    )
        .placeholder("Choose the next owner...")
        .min_values(1)
        .max_values(1);

    let row = CreateActionRow::SelectMenu(select_menu);

    let response = CreateInteractionResponseMessage::new()
        .content("Who do you want to transfer ownership to?")
        .components(vec![row])
        .ephemeral(true);

    interaction
        .create_response(&ctx.http, CreateInteractionResponse::Message(response))
        .await?;

    debug!("Transfer selection menu successfully sent to user");
    Ok(())
}

#[instrument(
    skip(ctx, data, target_user_ids),
    fields(
        current_owner_id = %interaction.user.id.get(),
        target_user_id = ?target_user_ids.first().map(|u| u.get())
    )
)]
pub(crate) async fn handle_transfer_temp_vc_submit(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
    target_user_ids: Vec<UserId>,
) -> Result<(), Error> {
    let Ok(Some((channel_id, guild_id))) = preflight_button_check(ctx, interaction, data).await else {
        debug!("Preflight check failed during target user submission");
        return Ok(());
    };

    let Some(&new_owner_id) = target_user_ids.first() else {
        warn!("Target user submission empty");
        return Ok(());
    };

    let current_owner_id = interaction.user.id;

    let response_message = service::initiate_temp_vc_transfer(
        ctx,
        &data.redis,
        guild_id,
        channel_id,
        current_owner_id,
        new_owner_id,
    ).await?;

    interaction
        .create_response(&ctx.http, create_ephemeral_msg(&response_message))
        .await?;

    let accept_btn = CreateButton::new("temp_voice_transfer_accept")
        .label("Accept")
        .style(ButtonStyle::Success);
    let decline_btn = CreateButton::new("temp_voice_transfer_decline")
        .label("Decline")
        .style(ButtonStyle::Danger);

    let row = CreateActionRow::Buttons(vec![accept_btn, decline_btn]);

    let message_content = format!(
        "<@{}>, <@{}> wants to transfer ownership of this channel to you! You have 90 seconds to accept.",
        new_owner_id, current_owner_id
    );

    let msg = CreateMessage::new().content(message_content).components(vec![row]);
    info!(
        "Sending transfer offer in channel {} from owner {} to target {}",
        channel_id.get(),
        current_owner_id.get(),
        new_owner_id.get()
    );

    if let Err(e) = channel_id.send_message(&ctx.http, msg).await {
        warn!("Failed to send transfer offer message: {:?}", e);
    }

    Ok(())
}