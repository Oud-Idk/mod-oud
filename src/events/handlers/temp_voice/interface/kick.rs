use crate::events::handlers::temp_voice::interface;
use crate::events::handlers::temp_voice::interface::preflight_modal_check;
use crate::events::handlers::temp_voice::interface::utils::{create_ephemeral_msg, get_input_value};
use crate::types::{Data, Error};
use serenity::all::{
    ComponentInteraction, Context, CreateActionRow, CreateInputText, CreateInteractionResponse,
    CreateModal, EditMember, InputTextStyle, ModalInteraction, UserId,
};
use tracing::{debug, error, warn};

pub(crate) async fn handle_kick_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Ok(Some((_, _))) = interface::preflight_button_check(&ctx, interaction, data).await else {
        return Ok(());
    }; // Verify the user is in the guild and in a voice channel

    debug!("Showing kick modal");

    let input = CreateInputText::new(
        InputTextStyle::Short,
        "User to kick",
        "user_to_kick",
    )
        .placeholder("Enter username, nickname, or User ID")
        .required(true);

    let modal = CreateModal::new(
        "temp_voice_kick_modal",
        "Kick from Voice Channel",
    )
        .components(vec![CreateActionRow::InputText(input)]);

    interaction
        .create_response(&ctx.http, CreateInteractionResponse::Modal(modal))
        .await?;
    Ok(())
}

pub(crate) async fn handle_kick_temp_vc_submit(
    ctx: &Context,
    interaction: &ModalInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Some((channel_id, guild_id)) = preflight_modal_check(&ctx, interaction, data).await? else {
        return Ok(());
    };

    debug!("Handling kick submit");

    let target_raw = get_input_value(&interaction, "user_to_kick").unwrap();
    let target_trimmed = target_raw.trim();

    if target_trimmed.is_empty() {
        return Ok(());
    }

    // Isolate the cache read to a synchronous block so CacheRef is dropped before the first .await
    let user_ids_in_vc = {
        guild_id.to_guild_cached(&ctx).map(|guild| {
            guild
                .voice_states
                .iter()
                .filter(|(_, state)| state.channel_id == Some(channel_id))
                .map(|(user_id, _)| *user_id)
                .collect::<Vec<UserId>>()
        })
    };

    let Some(user_ids_in_vc) = user_ids_in_vc else {
        warn!("Guild {} not found in cache", guild_id);
        interaction
            .create_response(
                &ctx,
                create_ephemeral_msg("Failed to access server cache. Please try again later."),
            )
            .await?;
        return Ok(());
    };

    let mut target_user_id: Option<UserId> = None;

    if let Ok(parsed_id) = target_trimmed.parse::<u64>() {
        let parsed_user_id = UserId::new(parsed_id);
        if user_ids_in_vc.contains(&parsed_user_id) {
            target_user_id = Some(parsed_user_id);
        }
    }

    if target_user_id.is_none() {
        let query_lower = target_trimmed.to_lowercase();

        for user_id in &user_ids_in_vc {
            if let Ok(member) = guild_id.member(&ctx, user_id).await {
                let name_match = member.user.name.to_lowercase().contains(&query_lower);
                let nick_match = member
                    .nick
                    .as_ref()
                    .map(|n| n.to_lowercase().contains(&query_lower))
                    .unwrap_or(false);

                if name_match || nick_match {
                    target_user_id = Some(*user_id);
                    break;
                }
            }
        }
    }

    let Some(target_id) = target_user_id else {
        debug!("Cannot find user with target {}", target_raw);
        interaction
            .create_response(
                &ctx,
                create_ephemeral_msg(
                    "Could not find a user in your voice channel matching that name or ID.",
                ),
            )
            .await?;
        return Ok(());
    };

    // Disconnect the user from the voice channel
    let edit_builder = EditMember::new().disconnect_member();
    match guild_id.edit_member(&ctx, target_id, edit_builder).await {
        Ok(_) => {
            debug!("Successfully kicked user {} from {}", target_id, channel_id);
            interaction
                .create_response(
                    &ctx,
                    create_ephemeral_msg(&format!("Successfully kicked <@{target_id}> from the channel.")),
                )
                .await?;
        }
        Err(err) => {
            error!("Failed to disconnect member {}: {:?}", target_id, err);
            interaction
                .create_response(
                    &ctx,
                    create_ephemeral_msg(
                        "Could not kick the user. Do I have the 'Move Members' permission?",
                    ),
                )
                .await?;
        }
    }

    Ok(())
}