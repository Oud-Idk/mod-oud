use anyhow::Context as _;
use crate::core::config::guild_ctx::{GuildCtx, get_guild_ctx};
use crate::core::config::settings::get_settings;
use crate::features::tickets;
use crate::features::tickets::TicketConfig;
use crate::features::tickets::cache::{initialize_redis_state};
use crate::features::tickets::database::save_ticket_to_db;
use crate::features::tickets::events::message;
use crate::features::tickets::placeholders::replace_ticket_welcome_placeholders;
use crate::shared::embed::build_custom_message;
use crate::{Data, Error};
use serenity::all::{ChannelId, ChannelType, ComponentInteraction, Context, CreateChannel, CreateInteractionResponse, CreateInteractionResponseMessage, CreateMessage, GuildChannel, GuildId, Message, MessageId, PermissionOverwrite, PermissionOverwriteType, Permissions, RoleId, UserId};
use tracing::{debug, info, instrument, trace, warn};

#[instrument(skip(ctx, data, component), fields(guild_id = ?component.guild_id, user_id = %component.user.id
))]
pub async fn on_open_ticket(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    trace!("Opening ticket event received.");

    let redis = &data.redis;
    let db = &data.db;

    let Some(guild_id) = component.guild_id else {
        trace!("Interaction occurs outside of a guild context; ignoring");
        return Ok(());
    };
    let user_interact = &component.user;

    debug!("Checking settings validation for ticket generation");
    let settings = get_settings(db, redis, &data.guild_configs, guild_id.get() as i64).await?;
    let tickets = settings.tickets.as_ref();

    let Some(role_u64) = tickets.and_then(|t| t.ticket_role_id) else {
        warn!("Ticket staff role missing from guild configuration");
        message::send_missing_config_error(ctx, component).await?;
        return Ok(());
    };

    let role_id = RoleId::new(role_u64);

    if tickets.map(|t| t.enabled) != Some(true) {
        debug!("Ticket system is disabled in this guild settings");
        message::send_disabled_error(ctx, component).await?;
        return Ok(());
    }

    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Defer(CreateInteractionResponseMessage::default().ephemeral(true)),
        )
        .await?;

    let member = component
        .member
        .as_ref()
        .with_context(|| "Interaction missing member data")?;
    let gctx = get_guild_ctx(guild_id, &ctx.http).await?;

    let ticket_category_id = settings
        .tickets
        .as_ref()
        .and_then(|t| t.category_id);

    debug!("Creating channel overwrites and constructing new Discord channel");
    let overwrites = build_permission_overwrites(guild_id, user_interact.id, role_id);
    let ticket_channel = create_ticket_channel(
        ctx,
        guild_id,
        &user_interact.name,
        overwrites,
        ticket_category_id,
    ).await?;

    let resolved_role_name = if let Some(guild) = ctx.cache.guild(ticket_channel.guild_id) {
        guild.roles.get(&role_id).map(|r| r.name.clone())
    } else {
        ticket_channel.guild_id
            .roles(&ctx.http)
            .await
            .ok()
            .and_then(|roles| roles.get(&role_id).map(|r| r.name.clone()))
    };

    debug!("Sending custom ticket welcome layout");
    let welcome_msg = send_welcome_message(
        ctx,
        &ticket_channel,
        &member,
        &gctx,
        settings.tickets.as_ref(),
        &role_id,
        resolved_role_name.as_deref(),
    ).await?;

    debug!("Persisting new ticket status to DB and initializing state in Redis");
    tokio::try_join!(
        save_ticket_to_db(data, guild_id, ticket_channel.id, user_interact.id, welcome_msg.id, &member.user.name),
        initialize_redis_state(data, ticket_channel.id, welcome_msg.id),
    )?;

    let _: () = tickets::cache::publish_open_ticket(redis, &ticket_channel).await?;

    data.active_tickets.insert(ticket_channel.id.get(), ()).await;

    debug!("Confirming channel link to user interaction");
    component
        .edit_response(
            &ctx.http,
            serenity::all::EditInteractionResponse::new()
                .content(format!("Your ticket has been created: <#{}>", ticket_channel.id)),
        )
        .await?;

    info!(channel_id = %ticket_channel.id, "Ticket channel created and initialized successfully");
    Ok(())
}

fn build_permission_overwrites(guild_id: GuildId, user_id: UserId, role_id: RoleId) -> Vec<PermissionOverwrite> {
    vec![
        PermissionOverwrite {
            allow: Permissions::empty(),
            deny: Permissions::VIEW_CHANNEL,
            kind: PermissionOverwriteType::Role(RoleId::new(guild_id.get())),
        },
        PermissionOverwrite {
            allow: Permissions::VIEW_CHANNEL | Permissions::SEND_MESSAGES | Permissions::READ_MESSAGE_HISTORY,
            deny: Permissions::empty(),
            kind: PermissionOverwriteType::Member(user_id),
        },
        PermissionOverwrite {
            allow: Permissions::VIEW_CHANNEL | Permissions::SEND_MESSAGES | Permissions::READ_MESSAGE_HISTORY,
            deny: Permissions::empty(),
            kind: PermissionOverwriteType::Role(role_id),
        },
    ]
}

#[instrument(skip(ctx, overwrites))]
async fn create_ticket_channel(
    ctx: &Context,
    guild_id: GuildId,
    username: &str,
    overwrites: Vec<PermissionOverwrite>,
    category_id_str: Option<u64>,
) -> Result<GuildChannel, Error> {
    let mut channel_builder = CreateChannel::new(format!("ticket-{}", username))
        .kind(ChannelType::Text)
        .permissions(overwrites);

    if let Some(cat) = category_id_str {
        channel_builder = channel_builder.category(ChannelId::new(cat));
    }

    debug!("Calling Discord API to create ticket channel");
    let channel = guild_id.create_channel(&ctx.http, channel_builder).await?;
    Ok(channel)
}

#[instrument(skip(ctx, channel, member, gctx, ticket_cfg))]
async fn send_welcome_message(
    ctx: &Context,
    channel: &GuildChannel,
    member: &serenity::all::Member,
    gctx: &GuildCtx,
    ticket_cfg: Option<&TicketConfig>,
    role_id: &RoleId,
    role_name: Option<&str>,
) -> Result<Message, Error> {
    let default_embed = serenity::all::CreateEmbed::default()
        .title("Ticket Opened")
        .description(format!(
            "Hello <@{}>, welcome to your ticket. Please describe your issue. Support will be with you shortly.",
            member.user.id
        ))
        .color(0xffffff);

    let mut message_builder = if let Some(cfg) = ticket_cfg.map(|c| &c.welcome_message) {
        let custom_layout = build_custom_message(
            cfg.message.format,
            &cfg.message.content,
            &cfg.message.embed,
            |text| {
                replace_ticket_welcome_placeholders(
                    text,
                    gctx,
                    Some(member),
                    role_id,
                    role_name,
                    Some(channel),
                )
            },
        )
            .ok()
            .flatten();

        custom_layout.unwrap_or_else(|| {
            trace!("Custom ticket template parse failed or empty; using fallback system default layout");
            CreateMessage::default().embed(default_embed.clone())
        })
    } else {
        CreateMessage::default().embed(default_embed)
    };

    let close_button = vec![serenity::all::CreateActionRow::Buttons(vec![
        serenity::all::CreateButton::new("close_ticket")
            .label("Close Ticket")
            .style(serenity::all::ButtonStyle::Danger)
            .emoji('🔒'),
    ])];

    message_builder = message_builder.components(close_button);

    let message = channel.send_message(&ctx.http, message_builder).await?;
    Ok(message)
}

