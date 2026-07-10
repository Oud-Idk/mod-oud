use crate::events::handlers::temp_voice::interface;
use crate::events::handlers::temp_voice::interface::utils::create_ephemeral_msg;
use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{
    ComponentInteraction, Context, CreateActionRow, CreateInteractionResponse,
    CreateInteractionResponseMessage, CreateSelectMenu, CreateSelectMenuKind, PermissionOverwrite,
    PermissionOverwriteType, Permissions, UserId,
};
use tracing::debug;

pub(crate) async fn handle_block_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Ok(Some(_)) = interface::preflight_button_check(ctx, interaction, data).await else {
        return Ok(());
    };

    debug!("Showing user select menu for Block");

    let select_menu = CreateSelectMenu::new(
        "temp_voice_block_select",
        CreateSelectMenuKind::User { default_users: None },
    )
        .placeholder("Choose users to block...")
        .min_values(1)
        .max_values(25);

    let row = CreateActionRow::SelectMenu(select_menu);

    let response = CreateInteractionResponseMessage::new()
        .content("Select the users you want to **Block** from this channel:")
        .components(vec![row])
        .ephemeral(true);

    interaction
        .create_response(&ctx.http, CreateInteractionResponse::Message(response))
        .await?;

    Ok(())
}

pub(crate) async fn handle_block_temp_vc_submit(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
    target_user_ids: Vec<UserId>,
) -> Result<(), Error> {
    let Ok(Some((channel_id, guild_id))) = interface::preflight_button_check(ctx, interaction, data).await else {
        return Ok(());
    };

    // Filter out the caller
    let filtered_ids: Vec<UserId> = target_user_ids
        .into_iter()
        .filter(|id| *id != interaction.user.id)
        .collect();

    if filtered_ids.is_empty() {
        interaction
            .create_response(
                &ctx.http,
                create_ephemeral_msg("You can't block yourself! Who would run the channel?"),
            )
            .await?;
        return Ok(());
    }

    let mut blocked_mentions = Vec::new();

    for target_user_id in filtered_ids {
        debug!("Blocking user {} in channel {}", target_user_id, channel_id);

        let overwrite = PermissionOverwrite {
            allow: Permissions::empty(),
            deny: Permissions::VIEW_CHANNEL | Permissions::CONNECT,
            kind: PermissionOverwriteType::Member(target_user_id),
        };

        channel_id.create_permission(&ctx.http, overwrite).await?;

        // Force-disconnect them from the voice channel (fails silently if not present)
        let _ = guild_id.disconnect_member(&ctx.http, target_user_id).await;
        blocked_mentions.push(format!("<@{target_user_id}>"));
    }

    let content = format!(
        "The following users have been **blocked** and kicked from this channel: {}",
        blocked_mentions.join(", ")
    );

    interaction
        .create_response(&ctx.http, create_ephemeral_msg(&content))
        .await?;

    Ok(())
}