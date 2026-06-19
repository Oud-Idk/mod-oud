use crate::core::config::get_settings;
use crate::types::{Context, Error};
use poise::{serenity_prelude as serenity, CreateReply};
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
            }
            .to_string(),
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
    let settings = get_settings(&ctx.data().db, &ctx.data().redis, guild_id).await?;

    if let Some(ref ticket_cfg) = settings.tickets {
        if let Some(ref posted_id) = ticket_cfg.posted_message_id {
            if !posted_id.trim().is_empty() {
                ctx.send(
                    CreateReply::default()
                        .content("A ticket panel is already active. Please delete the existing panel before setting up a new one.")
                        .ephemeral(true),
                )
                    .await?;
                return Ok(());
            }
        }
    }

    let category_id: u64 = match category {
        Some(c) => c.id.get(),
        None => {
            let config_cat_id = settings.tickets.as_ref().and_then(|t| {
                t.category_id
            });

            match config_cat_id {
                Some(id) => id,
                None => {
                    ctx.send(
                        CreateReply::default()
                            .content("Please set a category for tickets using the dashboard/config first, or pass it as an argument.")
                            .ephemeral(true),
                    )
                        .await?;
                    return Ok(());
                }
            }
        }
    };

    let ticket_role_id: u64 = match role {
        Some(r) => r.id.get(),
        None => {
            let config_role_id = settings.tickets.as_ref().and_then(|t| {
                t.ticket_role_id
            });

            match config_role_id {
                Some(id) => id,
                None => {
                    ctx.send(
                        CreateReply::default()
                            .content("Please set a support role using the dashboard/config first, or pass it as an argument.")
                            .ephemeral(true),
                    )
                        .await?;
                    return Ok(());
                }
            }
        }
    };

    let target_channel_id: u64 = match &channel {
        Some(c) => c.id.get(),
        None => ctx.channel_id().get(),
    };

    // Build the message to send
    let embed = serenity::CreateEmbed::default()
        .title("Support Tickets")
        .description(format!(
            "Click the button below to open a support ticket. Our staff with role <@{}> will assist you shortly.",
            ticket_role_id
        ))
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

    // Send the message
    let sent_message = match channel {
        Some(c) => {
            c.send_message(&ctx.http(), message_builder).await?
        }
        None => {
            ctx.channel_id()
                .send_message(&ctx.http(), message_builder)
                .await?
        }
    };

    let message_id = sent_message.id.to_string();

    let mut tickets_payload = match settings.tickets {
        Some(cfg) => serde_json::to_value(cfg).unwrap_or_else(|_| serde_json::json!({})),
        None => serde_json::json!({
            "format": "embed",
            "content": "",
            "embed": "",
        }),
    };

    tickets_payload["category_id"] = serde_json::json!(category_id);
    tickets_payload["ticket_role_id"] = serde_json::json!(ticket_role_id);
    tickets_payload["channel_id"] = serde_json::json!(target_channel_id);
    tickets_payload["enabled"] = serde_json::json!(true);
    tickets_payload["posted_message_id"] = serde_json::json!(message_id);

    sqlx::query!(
        r#"
        INSERT INTO guild_configs (guild_id, settings)
        VALUES ($1, $2)
        ON CONFLICT (guild_id)
        DO UPDATE SET settings = guild_configs.settings || EXCLUDED.settings
        "#,
        guild_id,
        serde_json::json!({
            "tickets": tickets_payload
        }),
    )
        .execute(&ctx.data().db)
        .await?;

    ctx.send(
        CreateReply::default()
            .content("Ticket system has been set up successfully!")
            .ephemeral(true),
    )
        .await?;

    Ok(())
}