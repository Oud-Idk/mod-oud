use crate::features::temp_voice::database::get_hub_info_by_category;
use crate::features::temp_voice::placeholders::replace_channel_placeholders;
use fred::interfaces::KeysInterface;
use poise::serenity_prelude as serenity;
use serenity::all::{Channel, ChannelId, ComponentInteraction, Context, CreateActionRow, CreateInputText, CreateInteractionResponse, CreateModal, EditChannel, InputTextStyle, ModalInteraction};

use crate::features::temp_voice::interface::{create_ephemeral_msg, get_new_name, preflight_button_check, preflight_modal_check};
use crate::{Data, Error};
use tracing::{debug, trace, warn};

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
    let Some(
        (channel_id, guild_id)
    ) = preflight_modal_check(&ctx, interaction, data).await? else {
        return Ok(());
    };

    let Some(interaction_member) = interaction.member.clone() else {
        warn!("Interaction doesn't have a member");
        return Ok(());
    };

    debug!("Handling rename submit");

    let Some(new_name) = get_new_name(interaction) else { return Ok(()) };

    let mut trimmed = new_name.trim();
    let reset_name;

    if trimmed.is_empty() {
        trace!("User left name blank; resetting to default template.");

        let Some(guild_channel) = Channel::guild(channel_id.to_channel(&ctx).await?) else {
            warn!("Could not find the current channel in cache to retrieve category");
            return Ok(());
        };

        let Some(category_id) = guild_channel.parent_id else {
            warn!("The voice channel does not belong to a category!");
            return Ok(());
        };

        let redis = &data.redis;
        let cache_key = format!("temp_voice_hub_by_category:{}:{}", guild_id, category_id);
        let cached_json: Option<String> = redis.get(&cache_key).await?;

        let hub_info = get_hub_info_by_category(
            guild_id, &data.redis, &data.db, category_id, &cache_key, cached_json,
        ).await?;

        let Some(hub_info) = hub_info else {
            warn!(
                "hub_info is None, but user is in temp VC, which shouldn't be possible. \
                Please check later."
            );
            return Ok(());
        };

        reset_name = replace_channel_placeholders(
            &hub_info.default_channel_name, &guild_id, &ctx, &interaction_member,
        ).await?;

        trimmed = &reset_name; // Reassign trimmed to the fallback name
    }

    match channel_id.edit(&ctx.http, EditChannel::new().name(
        replace_channel_placeholders(trimmed, &guild_id, &ctx, &interaction_member).await?
    )).await {
        Ok(_) => {
            debug!(
                channel_id = channel_id.get(),
                name = trimmed,
                "Successfully renamed the channel"
            );
            interaction
                .create_response(&ctx.http, create_ephemeral_msg(
                    &format!("Renamed the channel to **{trimmed}**."
                    )))
                .await?;
        }
        Err(serenity::Error::Http(http_err)) if is_rate_limited(&http_err) => {
            debug!("Rate limit exceeded for renaming channel!");
            interaction
                .create_response(&ctx.http,
                    create_ephemeral_msg(
                        "This channel was renamed too recently. \
                        Discord only allows a couple renames every 10 minutes. \
                        Try again shortly."
                    )
                )
                .await?;
        }
        Err(e) => return Err(e.into()),
    }

    Ok(())
}

pub fn is_rate_limited(err: &serenity::http::HttpError) -> bool {
    matches!(
        err,
        serenity::http::HttpError::UnsuccessfulRequest(resp) if resp.status_code.as_u16() == 429,
    )
}