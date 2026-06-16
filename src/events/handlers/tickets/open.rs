use crate::core::config::get_settings;
use crate::events::handlers::tickets::utils::{get_configured_role, initialize_redis_state, send_missing_config_error};
use crate::types::{Data, Error};
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

    // Resolve staff role or return early if unconfigured
    let role_id = match get_configured_role(&settings.ticket_role_id) {
        Some(role) => role,
        None => {
            send_missing_config_error(ctx, component).await?;
            return Ok(());
        }
    };

    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Defer(CreateInteractionResponseMessage::default().ephemeral(true)),
        )
        .await?;

    // Create channel
    let overwrites = build_permission_overwrites(guild_id, user_interact.id, role_id);
    let ticket_channel = create_ticket_channel(
        ctx,
        guild_id,
        &user_interact.name,
        overwrites,
        settings.ticket_category_id,
    ).await?;

    // Send welcome assets
    let welcome_msg = send_welcome_message(ctx, &ticket_channel, user_interact.id).await?;

    // Track ticket in DB & Redis
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

// --- Helper Functions ---

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
    category_id_str: Option<String>,
) -> Result<serenity::all::GuildChannel, Error> {
    let mut channel_builder = CreateChannel::new(format!("ticket-{}", username))
        .kind(ChannelType::Text)
        .permissions(overwrites);

    if let Some(cat_str) = category_id_str {
        if let Ok(cat_u64) = cat_str.parse::<u64>() {
            channel_builder = channel_builder.category(ChannelId::new(cat_u64));
        }
    }

    let channel = guild_id.create_channel(&ctx.http, channel_builder).await?;
    Ok(channel)
}

async fn send_welcome_message(ctx: &Context, channel: &serenity::all::GuildChannel, user_id: UserId) -> Result<Message, Error> {
    let welcome_embed = serenity::all::CreateEmbed::default()
        .title("Ticket Opened")
        .description(format!(
            "Hello <@{}>, welcome to your ticket. Please describe your issue. Support will be with you shortly.",
            user_id
        ))
        .color(0x2ECC71);

    let close_button = vec![serenity::all::CreateActionRow::Buttons(vec![
        serenity::all::CreateButton::new("close_ticket")
            .label("Close Ticket")
            .style(serenity::all::ButtonStyle::Danger)
            .emoji('🔒'),
    ])];

    let message = channel
        .send_message(
            &ctx.http,
            CreateMessage::default()
                .embed(welcome_embed)
                .components(close_button),
        )
        .await?;
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

