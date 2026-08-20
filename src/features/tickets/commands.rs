#![allow(missing_docs, clippy::unused_async)]
use crate::core::config::settings::{GuildSettings, get_settings, save_settings};
use crate::core::config::state::{Context, Error};
use crate::features::tickets::panel::build_ticket_message_payload;
use poise::{CreateReply, serenity_prelude as serenity};
use serenity::all::{ChannelId, GuildChannel, GuildId, MessageId, Role, RoleId};
use tracing::{debug, info};

#[derive(Clone, Copy)]
#[allow(clippy::struct_field_names)]
struct ResolvedSetupParams {
    category_id: ChannelId,
    ticket_role_id: RoleId,
    target_channel_id: ChannelId,
}

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
        %guild_id,
        "Moderator invoked setup_tickets slash command"
    );

    let settings = get_settings(
        &ctx.data().core.db,
        &ctx.data().core.redis,
        &ctx.data().core.guild_configs_cache,
        guild_id,
    )
    .await?;

    // Validate preconditions and resolve IDs
    let Some(params) =
        resolve_and_validate_params(ctx, &settings, guild_id, category, channel, role).await?
    else {
        return Ok(());
    };

    // Build and dispatch the ticket panel message
    let Some(message_id) = post_ticket_panel(ctx, guild_id, &settings, &params).await? else {
        return Ok(());
    };

    // Persist the updated configuration
    save_ticket_configuration(ctx, guild_id, settings, params, message_id).await?;

    ctx.send(
        CreateReply::default()
            .content("Ticket system has been set up successfully!")
            .ephemeral(true),
    )
    .await?;

    info!(
        %guild_id,
        caller_id = %ctx.author().id,
        target_channel_id = %params.target_channel_id,
        %message_id,
        "Ticket system setup process completed successfully"
    );

    Ok(())
}

/// Validates that no active panel exists and resolves all required channel/role IDs.
async fn resolve_and_validate_params(
    ctx: Context<'_>,
    settings: &GuildSettings,
    guild_id: GuildId,
    category: Option<GuildChannel>,
    channel: Option<GuildChannel>,
    role: Option<Role>,
) -> Result<Option<ResolvedSetupParams>, Error> {
    // Check if an active panel is already registered
    if let Some(ref ticket_cfg) = settings.tickets
        && ticket_cfg.posted_message_id.is_some()
    {
        debug!(%guild_id, "Ticket setup blocked: active ticket panel already exists");
        ctx.send(
            CreateReply::default()
                .content("A ticket panel is already active. Please delete the existing panel before setting up a new one.")
                .ephemeral(true),
        ).await?;
        return Ok(None);
    }

    // Resolve Category ID
    let Some(category_id) = category
        .map(|c| c.id)
        .or_else(|| settings.tickets.as_ref().and_then(|t| t.category_id))
    else {
        debug!(%guild_id, "Ticket setup blocked: category_id not provided or configured");
        ctx.send(
            CreateReply::default()
                .content("Please set a category for tickets using the dashboard/config first, or pass it as an argument.")
                .ephemeral(true),
        ).await?;
        return Ok(None);
    };

    // Resolve Support Role ID
    let Some(ticket_role_id) = role
        .map(|r| r.id)
        .or_else(|| settings.tickets.as_ref().and_then(|t| t.ticket_role_id))
    else {
        debug!(%guild_id, "Ticket setup blocked: support role not provided or configured");
        ctx.send(
            CreateReply::default()
                .content("Please set a support role using the dashboard/config first, or pass it as an argument.")
                .ephemeral(true),
        ).await?;
        return Ok(None);
    };

    let target_channel_id = channel.map_or_else(|| ctx.channel_id(), |c| c.id);

    Ok(Some(ResolvedSetupParams {
        category_id,
        ticket_role_id,
        target_channel_id,
    }))
}

/// Builds the ticket panel payload and sends it to the target channel.
async fn post_ticket_panel(
    ctx: Context<'_>,
    guild_id: GuildId,
    settings: &GuildSettings,
    params: &ResolvedSetupParams,
) -> Result<Option<MessageId>, Error> {
    let Some(ref ticket_cfg) = settings.tickets else {
        debug!(%guild_id, "Ticket setup blocked: no message configured");
        ctx.send(
            CreateReply::default()
                .content(
                    "Please set a message for the ticket panel using the dashboard/config first.",
                )
                .ephemeral(true),
        )
        .await?;
        return Ok(None);
    };

    debug!(%guild_id, "Compiling ticket panel layouts and assets");
    let message_builder = build_ticket_message_payload(
        ctx.http(),
        guild_id,
        params.ticket_role_id,
        ticket_cfg.panel_message.message.format,
        &ticket_cfg.panel_message.message.content,
        &ticket_cfg.panel_message.message.embed,
    )
    .await?;

    debug!(
        %guild_id,
        target_channel_id = %params.target_channel_id,
        "Dispatching ticket panel message to Discord API"
    );

    // ChannelId::send_message works directly without needing to branch on Option<GuildChannel>!
    let sent_message = params
        .target_channel_id
        .send_message(ctx.http(), message_builder)
        .await?;

    Ok(Some(sent_message.id))
}

/// Saves the new ticket configuration into DB and Cache.
async fn save_ticket_configuration(
    ctx: Context<'_>,
    guild_id: GuildId,
    mut settings: GuildSettings,
    params: ResolvedSetupParams,
    message_id: MessageId,
) -> Result<(), Error> {
    let ticket_cfg = settings.tickets.get_or_insert_with(Default::default);
    ticket_cfg.category_id = Some(params.category_id);
    ticket_cfg.ticket_role_id = Some(params.ticket_role_id);
    ticket_cfg.channel_id = Some(params.target_channel_id);
    ticket_cfg.enabled = true;
    ticket_cfg.posted_message_id = Some(message_id);

    save_settings(
        &ctx.data().core.db,
        &ctx.data().core.redis,
        &ctx.data().core.guild_configs_cache,
        guild_id,
        &settings,
    )
    .await?;

    Ok(())
}
