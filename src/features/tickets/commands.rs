#![allow(missing_docs, clippy::unused_async)]
use crate::core::config::settings::{get_settings, save_settings};
use crate::core::config::state::{Context, Error};
use crate::features::tickets::database;
use crate::features::tickets::panel::build_ticket_message_payload;
use poise::{CreateReply, serenity_prelude as serenity};
use serde_json::Value;
use serenity::all::{GuildChannel, GuildId, Role};
use tracing::{debug, info, warn};

/// Setups the ticket system
#[poise::command(
    slash_command,
    guild_only,
    default_member_permissions = "MANAGE_CHANNELS | MODERATE_MEMBERS"
)]
pub async fn setup_tickets(
    ctx: Context<'_>,
    #[description = "Category for ticket (optional if you've set it through /config set. /config takes precedence.)"]
    #[channel_types("Category")]
    category: Option<GuildChannel>,
    #[description = "The channel to send on. Defaults to the current channel"]
    #[channel_types("Text")]
    channel: Option<GuildChannel>,
    #[description = "The role for viewing the tickets."] role: Option<Role>,
) -> Result<(), Error> {
    let Some(guild_id) = ctx.guild_id() else {
        return Ok(());
    };

    info!(
        caller_id = %ctx.author().id,
        %guild_id, "Moderator invoked setup_tickets slash command"
    );

    let settings = get_settings(
        &ctx.data().core.db,
        &ctx.data().core.redis,
        &ctx.data().core.guild_configs_cache,
        guild_id,
    )
    .await?;

    if let Some(ref ticket_cfg) = settings.tickets
        && ticket_cfg.posted_message_id == None
    {
        debug!(
            %guild_id,
            "Ticket setup blocked: active ticket panel already exists"
        );
        ctx.send(
            CreateReply::default()
                .content("A ticket panel is already active. Please delete the existing panel before setting up a new one.")
                .ephemeral(true),
        )
            .await?;
        return Ok(());
    }
    let Some(category_id) = category
        .map(|c| c.id)
        .or_else(|| settings.tickets.as_ref().and_then(|t| t.category_id))
    else {
        debug!(
            %guild_id,
            "Ticket setup blocked: category_id not provided or configured"
        );
        ctx.send(
            CreateReply::default()
                .content("Please set a category for tickets using the dashboard/config first, or pass it as an argument.")
                .ephemeral(true),
        )
            .await?;
        return Ok(());
    };

    let Some(ticket_role_id) = role
        .map(|r| r.id)
        .or_else(|| settings.tickets.as_ref().and_then(|t| t.ticket_role_id))
    else {
        debug!(
            %guild_id,
            "Ticket setup blocked: support role not provided or configured"
        );
        ctx.send(
            CreateReply::default()
                .content("Please set a support role using the dashboard/config first, or pass it as an argument.")
                .ephemeral(true),
        )
            .await?;
        return Ok(());
    };

    let target_channel_id = match &channel {
        Some(c) => c.id,
        None => ctx.channel_id(),
    };

    debug!(%guild_id, "Compiling ticket panel layouts and assets");
    let message_builder = if let Some(ref ticket_cfg) = settings.tickets {
        build_ticket_message_payload(
            ctx.http(),
            guild_id,
            ticket_role_id,
            ticket_cfg.panel_message.message.format,
            &ticket_cfg.panel_message.message.content,
            &ticket_cfg.panel_message.message.embed,
        )
        .await?
    } else {
        debug!(%guild_id, "Ticket setup blocked: no message configured");
        ctx.send(
            CreateReply::default()
                .content(
                    "Please set a message for the ticket panel using the dashboard/config first.",
                )
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    };

    debug!(
        %guild_id,
        %target_channel_id, "Dispatching ticket panel message to Discord API"
    );
    // Send the message
    let sent_message = match channel {
        Some(c) => c.send_message(ctx.http(), message_builder).await?,
        None => {
            ctx.channel_id()
                .send_message(ctx.http(), message_builder)
                .await?
        }
    };

    let message_id = sent_message.id;
    let mut new_settings = settings.clone();

    let ticket_cfg = new_settings.tickets.get_or_insert_with(Default::default);
    ticket_cfg.category_id = Some(category_id);
    ticket_cfg.ticket_role_id = Some(ticket_role_id);
    ticket_cfg.channel_id = Some(target_channel_id);
    ticket_cfg.enabled = true;
    ticket_cfg.posted_message_id = Some(message_id);

    save_settings(
        &ctx.data().core.db,
        &ctx.data().core.redis,
        &ctx.data().core.guild_configs_cache,
        guild_id,
        &new_settings,
    )
    .await?;

    ctx.send(
        CreateReply::default()
            .content("Ticket system has been set up successfully!")
            .ephemeral(true),
    )
    .await?;

    info!(
        %guild_id,
        caller_id = %ctx.author().id,
        %target_channel_id,
        %message_id,
        "Ticket system setup process completed successfully"
    );

    Ok(())
}
