use crate::events::handlers::temp_voice::interface;
use crate::events::handlers::temp_voice::interface::utils::create_ephemeral_msg;
use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{
    ComponentInteraction, Context, CreateActionRow, CreateInteractionResponse,
    CreateInteractionResponseMessage, CreateSelectMenu, CreateSelectMenuKind,
    PermissionOverwriteType, UserId,
};
use tracing::debug;

pub(crate) async fn handle_unblock_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Ok(Some(_)) = interface::preflight_button_check(ctx, interaction, data).await else {
        return Ok(());
    };

    debug!("Showing user select menu for Unblock");

    let select_menu = CreateSelectMenu::new(
        "temp_voice_unblock_select",
        CreateSelectMenuKind::User { default_users: None },
    )
        .placeholder("Choose users to unblock...")
        .min_values(1)
        .max_values(25);

    let row = CreateActionRow::SelectMenu(select_menu);

    let response = CreateInteractionResponseMessage::new()
        .content("Select the users you want to **Unblock** in this channel:")
        .components(vec![row])
        .ephemeral(true);

    interaction
        .create_response(&ctx.http, CreateInteractionResponse::Message(response))
        .await?;

    Ok(())
}

pub(crate) async fn handle_unblock_temp_vc_submit(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
    target_user_ids: Vec<UserId>,
) -> Result<(), Error> {
    let Ok(Some((channel_id, _))) = interface::preflight_button_check(ctx, interaction, data).await else {
        return Ok(());
    };

    if target_user_ids.is_empty() {
        return Ok(());
    }

    let mut unblocked_mentions = Vec::new();

    for target_user_id in target_user_ids {
        debug!("Unblocking user {} in channel {}", target_user_id, channel_id);
        let target = PermissionOverwriteType::Member(target_user_id);

        if let Err(e) = channel_id.delete_permission(&ctx.http, target).await {
            match e {
                serenity::Error::Http(ref http_err) => {
                    if http_err.status_code() != Some(serenity::all::StatusCode::NOT_FOUND) {
                        return Err(e.into());
                    }
                }
                _ => return Err(e.into()),
            }
        }
        unblocked_mentions.push(format!("<@{target_user_id}>"));
    }

    let content = format!("The following users have been **unblocked**: {}", unblocked_mentions.join(", "));
    interaction
        .create_response(&ctx.http, create_ephemeral_msg(&content))
        .await?;

    Ok(())
}