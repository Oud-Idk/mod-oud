use crate::core::config::state::{BotData, Error};
use crate::features::temp_voice::interface::{create_ephemeral_msg, preflight_button_check};
use crate::features::temp_voice::service;
use serenity::all::{
    ComponentInteraction, Context, CreateActionRow, CreateInteractionResponse,
    CreateInteractionResponseMessage, CreateSelectMenu, CreateSelectMenuKind, UserId,
};
use tracing::debug;

pub(crate) async fn handle_trust_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    let Ok(Some(_)) = preflight_button_check(ctx, interaction, data).await else {
        return Ok(());
    };

    debug!("Showing user select menu for Trust");

    let select_menu = CreateSelectMenu::new(
        "temp_voice_trust_select",
        CreateSelectMenuKind::User { default_users: None },
    )
        .placeholder("Choose users to trust...")
        .min_values(1)
        .max_values(25);

    let row = CreateActionRow::SelectMenu(select_menu);

    let response = CreateInteractionResponseMessage::new()
        .content("Select the users you want to **Trust** in this channel:")
        .components(vec![row])
        .ephemeral(true);

    interaction
        .create_response(&ctx.http, CreateInteractionResponse::Message(response))
        .await?;

    Ok(())
}

pub(crate) async fn handle_trust_temp_vc_submit(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &BotData,
    target_user_ids: Vec<UserId>,
) -> Result<(), Error> {
    let Ok(Some((channel_id, _))) = preflight_button_check(ctx, interaction, data).await else {
        return Ok(());
    };

    let response_message = service::trust_users_in_vc(
        &ctx.http,
        channel_id,
        target_user_ids,
        interaction.user.id,
    ).await?;

    interaction
        .create_response(&ctx.http, create_ephemeral_msg(&response_message))
        .await?;

    Ok(())
}