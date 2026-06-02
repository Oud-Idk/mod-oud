use crate::core::config::get_settings;
use crate::types::{Context, Error};
use poise::{CreateReply, serenity_prelude as serenity};
use serenity::all::{GuildChannel, Role};

macro_rules! get_or_error {
    ($config:expr, $fallback:expr, $ctx:expr, $msg:expr) => {
        match $config {
            Some(id) => id,
            None => match $fallback {
                Some(obj) => obj.id.get() as i64,
                None => {
                    $ctx.send(CreateReply::default().content($msg).ephemeral(true))
                        .await?;
                    return Ok(());
                }
            },
        }
    };
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
    let guild_id = ctx.guild_id().unwrap().get() as i64;
    let settings = get_settings(&ctx.data().db, guild_id).await?;
    let ticket_category_id_config = settings.ticket_category_id;
    let ticket_category_id = get_or_error!(
        ticket_category_id_config,
        category,
        ctx,
        "Please set a category for this"
    );

    let ticket_role_id = get_or_error!(
        settings.ticket_role_id,
        role,
        ctx,
        "Please set a role for this"
    );

    sqlx::query!(
        r#"
        INSERT INTO guild_configs (guild_id, settings)
        VALUES ($1, $2)
        ON CONFLICT (guild_id)
        DO UPDATE SET settings = guild_configs.settings || EXCLUDED.settings
        "#,
        guild_id,
        serde_json::json!({
            "ticket_category_id": ticket_category_id,
            "ticket_role_id": ticket_role_id,
        }),
    )
    .execute(&ctx.data().db)
    .await?;

    let embed = serenity::CreateEmbed::default()
        .title("Support Tickets")
        .description(
            format!("Click the button below to open a support ticket. Our staff with role <@{}> will assist you shortly.", ticket_role_id),
        )
        .color(0x5865F2);

    let components = vec![serenity::CreateActionRow::Buttons(vec![
        serenity::CreateButton::new("open_ticket")
            .label("Open Ticket")
            .style(serenity::ButtonStyle::Primary)
            .emoji('🎫'),
    ])];

    let message_builder = serenity::all::CreateMessage::default()
        .embed(embed)
        .components(components);

    match channel {
        Some(c) => {
            c.send_message(&ctx.http(), message_builder).await?;
        }
        None => {
            ctx.channel_id()
                .send_message(&ctx.http(), message_builder)
                .await?;
        }
    };

    ctx.send(
        CreateReply::default()
            .content("Ticket system has been set up successfully!")
            .ephemeral(true),
    )
    .await?;

    Ok(())
}
