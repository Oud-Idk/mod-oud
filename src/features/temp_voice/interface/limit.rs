use crate::features::temp_voice::interface::{create_ephemeral_msg, get_input_value, preflight_button_check, preflight_modal_check};
use crate::{Data, Error};
use serenity::all::{ComponentInteraction, Context, CreateActionRow, CreateInputText, CreateInteractionResponse, CreateModal, EditChannel, InputTextStyle, ModalInteraction};
use tracing::{debug, error, trace, warn};
pub(crate) async fn handle_set_limit_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
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
    data: &Data,
) -> Result<(), Error> {
    let Some(
        (channel_id, _)
    ) = preflight_modal_check(&ctx, interaction, data).await? else {
        return Ok(());
    };

    debug!("Handling limit submit");

    let limit_raw = get_input_value(&interaction, "new_limit").unwrap();
    let limit_trimmed = limit_raw.trim();
    let limit_parsed = if limit_trimmed.is_empty() {
        0
    } else {
        match limit_trimmed.parse::<u32>() {
            Ok(num) => num,
            Err(_) => {
                trace!("User submitted invalid string. Skipping.");
                interaction.create_response(
                    &ctx,
                    create_ephemeral_msg(
                        "Input isn't valid or is negative. \
                        Please enter a number between 1 and 99, or leave it blank to reset. \
                        0 is an alias for resetting too.",
                    )
                ).await?;
                return Ok(());
            }
        }
    };

    if limit_parsed > 99 { // negative check not needed since limit_parsed is u32
        trace!("User submitted invalid limit. Skipping.");
        interaction.create_response(
            &ctx, create_ephemeral_msg(
                "Limit is too big. Please try again."
            )
        ).await?;
        return Ok(());
    }

    let builder = EditChannel::new().user_limit(limit_parsed);
    match channel_id.edit(&ctx, builder).await {
        Ok(_) => {
            trace!("Successfully set limit to {limit_parsed} for channel {channel_id}");

            interaction.create_response(
                &ctx,
                create_ephemeral_msg(
                    &format!("Success! The voice channel limit is now set to {limit_parsed}."),
                )
            ).await?;
        },
        Err(err) => {
            error!("Failed to edit channel {channel_id}: {:?}", err);

            interaction.create_response(
                &ctx,
                create_ephemeral_msg(
                    "Uh oh, I couldn't update the limit. \
                    Do I have the 'Manage Channels' permission?",
                )
            ).await?;
        },
    };

    Ok(())
}