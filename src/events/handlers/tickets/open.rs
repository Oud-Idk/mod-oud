use crate::core::config::{get_guild_ctx, get_settings, replace_welcome_goodbye_placeholders, GuildCtx};
use crate::events::handlers::tickets::utils::{initialize_redis_state, send_disabled_error, send_missing_config_error};
use crate::types::config::config::{Format, TicketConfig};
use crate::types::{Data, Error};
use crate::utils::custom_msg::build_custom_message;
use poise::serenity_prelude as serenity;
use serenity::all::{
    ChannelId, ChannelType, ComponentInteraction, Context, CreateChannel,
    CreateInteractionResponse, CreateInteractionResponseMessage, CreateMessage,
    GuildId, Message, PermissionOverwrite, PermissionOverwriteType, Permissions, RoleId, UserId,
};

pub async fn on_open_ticket(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Some(guild_id) = component.guild_id else {
        return Ok(());
    };
    let user_interact = &component.user;
    let settings = get_settings(&data.db, &data.redis, guild_id.get() as i64).await?;
    let tickets = settings.tickets.as_ref();

    let role_id = match tickets.and_then(|t| t.ticket_role_id) {
        Some(role_u64) => RoleId::new(role_u64),
        None => {
            send_missing_config_error(ctx, component).await?;
            return Ok(());
        }
    };

    if tickets.and_then(|t| t.enabled) != Some(true) {
        send_disabled_error(ctx, component).await?;
        return Ok(());
    }

    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Defer(CreateInteractionResponseMessage::default().ephemeral(true)),
        )
        .await?;

    let member = guild_id.member(&ctx.http, user_interact.id).await?;
    let gctx = get_guild_ctx(guild_id, &ctx.http).await?;

    let ticket_category_id = settings
        .tickets
        .as_ref()
        .and_then(|t| t.category_id);

    let overwrites = build_permission_overwrites(guild_id, user_interact.id, role_id);
    let ticket_channel = create_ticket_channel(
        ctx,
        guild_id,
        &user_interact.name,
        overwrites,
        ticket_category_id,
    ).await?;

    // Pass member and gctx to send_welcome_message
    let welcome_msg = send_welcome_message(
        ctx,
        &ticket_channel,
        &member,
        &gctx,
        settings.tickets.as_ref()
    ).await?;

    save_ticket_to_db(data, guild_id, ticket_channel.id, user_interact.id, welcome_msg.id).await?;
    initialize_redis_state(data, ticket_channel.id, welcome_msg.id).await?;

    component
        .edit_response(
            &ctx.http,
            serenity::all::EditInteractionResponse::new()
                .content(format!("Your ticket has been created: <#{}>", ticket_channel.id)),
        )
        .await?;

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

async fn create_ticket_channel(
    ctx: &Context,
    guild_id: GuildId,
    username: &str,
    overwrites: Vec<PermissionOverwrite>,
    category_id_str: Option<u64>,
) -> Result<serenity::all::GuildChannel, Error> {
    let mut channel_builder = CreateChannel::new(format!("ticket-{}", username))
        .kind(ChannelType::Text)
        .permissions(overwrites);

    if let Some(cat) = category_id_str {
        channel_builder = channel_builder.category(ChannelId::new(cat)); // meow
    }

    let channel = guild_id.create_channel(&ctx.http, channel_builder).await?;
    Ok(channel)
}

async fn send_welcome_message(
    ctx: &Context,
    channel: &serenity::all::GuildChannel,
    member: &serenity::all::Member,
    gctx: &GuildCtx,
    ticket_cfg: Option<&TicketConfig>,
) -> Result<Message, Error> {
    let default_embed = serenity::all::CreateEmbed::default()
        .title("Ticket Opened")
        .description(format!(
            "Hello <@{}>, welcome to your ticket. Please describe your issue. Support will be with you shortly.",
            member.user.id
        ))
        .color(0x2ECC71);

    let mut message_builder = if let Some(cfg) = ticket_cfg.and_then(|c| c.welcome_message.as_ref()) {
        let is_embed = matches!(cfg.format, Format::Embed);

        let custom_layout = build_custom_message(
            is_embed,
            Some(&cfg.content),
            cfg.embed.as_ref(),
            |text| {
                replace_welcome_goodbye_placeholders(
                    text,
                    gctx,
                    member,
                    channel,
                    None, // No plan context
                    None, // No achievement context
                )
            },
        )
            .ok()
            .flatten();

        custom_layout.unwrap_or_else(|| {
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

async fn save_ticket_to_db(
    data: &Data,
    guild_id: GuildId,
    channel_id: ChannelId,
    user_id: UserId,
    welcome_msg_id: serenity::all::MessageId,
) -> Result<(), Error> {
    sqlx::query!(
        r#"
        INSERT INTO tickets (guild_id, channel_id, opener_id, last_button_message_id)
        VALUES ($1, $2, $3, $4)
        "#,
        guild_id.get() as i64,
        channel_id.get() as i64,
        user_id.get() as i64,
        welcome_msg_id.get() as i64
    )
        .execute(&data.db)
        .await?;
    Ok(())
}

