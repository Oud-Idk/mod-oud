use crate::events::handlers::temp_voice::interface;
use crate::events::handlers::temp_voice::interface::utils::create_ephemeral_msg;
use crate::types::{Data, Error};
use fred::interfaces::{HashesInterface, KeysInterface};
use fred::prelude::Expiration;
use poise::serenity_prelude as serenity;
use serenity::all::{
    ButtonStyle, ComponentInteraction, Context, CreateActionRow, CreateButton,
    CreateInteractionResponse, CreateInteractionResponseMessage, CreateMessage, CreateSelectMenu,
    CreateSelectMenuKind, PermissionOverwrite, PermissionOverwriteType, Permissions, UserId,
};
use tracing::{debug, error, info, instrument, warn};

#[instrument(skip(ctx, data), fields(user_id = %interaction.user.id.get()))]
pub(crate) async fn handle_transfer_temp_vc(
    ctx: &Context,
    interaction: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    debug!("Starting voice channel transfer workflow");

    let Ok(Some(_)) = interface::preflight_button_check(ctx, interaction, data).await else {
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
    let Ok(Some((channel_id, guild_id))) = interface::preflight_button_check(ctx, interaction, data).await else {
        debug!("Preflight check failed during target user submission");
        return Ok(());
    };

    let Some(&new_owner_id) = target_user_ids.first() else {
        warn!("Target user submission empty");
        return Ok(());
    };

    let current_owner_id = interaction.user.id;

    if new_owner_id == current_owner_id {
        debug!("User attempted to self-transfer ownership");
        interaction
            .create_response(&ctx.http, create_ephemeral_msg("You can't transfer to yourself!"))
            .await?;
        return Ok(());
    }

    enum VoicePresence {
        Confirmed(bool),
        CacheMiss,
    }

    let presence = match ctx.cache.guild(guild_id) {
        Some(guild) => {
            let in_channel = guild
                .voice_states
                .get(&new_owner_id)
                .and_then(|state| state.channel_id)
                == Some(channel_id);
            VoicePresence::Confirmed(in_channel)
        }
        None => VoicePresence::CacheMiss,
    };

    match presence {
        VoicePresence::CacheMiss => {
            warn!(guild_id = guild_id.get(), "Guild not in cache; cannot verify target's voice state");
            interaction
                .create_response(
                    &ctx.http,
                    create_ephemeral_msg("Couldn't verify the recipient right now, please try again in a moment!"),
                )
                .await?;
            return Ok(());
        }
        VoicePresence::Confirmed(false) => {
            debug!(
                "Transfer rejected: Target user {} is not present in channel {}",
                new_owner_id.get(),
                channel_id.get()
            );
            interaction
                .create_response(
                    &ctx.http,
                    create_ephemeral_msg("The recipient must be in the voice channel!"),
                )
                .await?;
            return Ok(());
        }
        VoicePresence::Confirmed(true) => {}
    }

    let redis = &data.redis;
    let owner_hash = format!("temp_vc_owners:{}", guild_id);

    let target_existing_vc: Option<String> = redis.hget(&owner_hash, new_owner_id.get().to_string()).await?;
    if target_existing_vc.is_some() {
        debug!("Transfer rejected: Target user already owns a temporary voice channel");
        interaction
            .create_response(
                &ctx.http,
                create_ephemeral_msg("That user already owns a temporary voice channel!"),
            )
            .await?;
        return Ok(());
    }

    let pending_key = format!("temp_vc_pending_transfer:{}", channel_id);
    redis
        .set::<(), _, _>(
            &pending_key,
            new_owner_id.get().to_string(),
            Some(Expiration::EX(90)),
            None,
            false,
        )
        .await?;

    debug!("Pending transfer state written to Redis with 90s TTL");

    interaction
        .create_response(&ctx.http, create_ephemeral_msg("Transfer offer sent! Waiting for them to accept..."))
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