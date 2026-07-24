use crate::core::config::settings::get_settings;
use crate::features::tickets::panel::build_ticket_message_payload;
use crate::{Context, Error};
use poise::{CreateReply, serenity_prelude as serenity};
use serenity::all::{GuildChannel, Role};
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
    let guild_id = ctx.guild_id().unwrap().get() as i64;
    let caller_id = ctx.author().id.get();

    info!(
        caller_id,
        guild_id,
        "Moderator invoked setup_tickets slash command"
    );

    let settings = get_settings(&ctx.data().db, &ctx.data().redis, &ctx.data().guild_configs, guild_id).await?;

    if let Some(ref ticket_cfg) = settings.tickets {
        if let Some(ref posted_id) = ticket_cfg.posted_message_id {
            if !posted_id.trim().is_empty() {
                debug!(guild_id, "Ticket setup blocked: active ticket panel already exists");
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
            let config_cat_id = settings.tickets.as_ref().and_then(|t| t.category_id);

            match config_cat_id {
                Some(id) => id,
                None => {
                    debug!(guild_id, "Ticket setup blocked: category_id not provided or configured");
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
            let config_role_id = settings.tickets.as_ref().and_then(|t| t.ticket_role_id);

            match config_role_id {
                Some(id) => id,
                None => {
                    debug!(guild_id, "Ticket setup blocked: support role not provided or configured");
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

    let serenity_guild_id = serenity::GuildId::new(guild_id as u64);

    debug!(guild_id, "Compiling ticket panel layouts and assets");
    // Build the message to send, respecting any existing configurations
    let message_builder = if let Some(ref ticket_cfg) = settings.tickets {
        build_ticket_message_payload(
            ctx.http(),
            serenity_guild_id,
            Some(ticket_role_id),
            Some(&ticket_cfg.format),
            ticket_cfg.content.as_ref(),
            ticket_cfg.embed.as_ref(),
        )
            .await?
    } else {
        build_ticket_message_payload(
            ctx.http(),
            serenity_guild_id,
            Some(ticket_role_id),
            None,
            None,
            None,
        )
            .await?
    };

    debug!(guild_id, target_channel_id, "Dispatching ticket panel message to Discord API");
    // Send the message
    let sent_message = match channel {
        Some(c) => c.send_message(ctx.http(), message_builder).await?,
        None => ctx.channel_id().send_message(ctx.http(), message_builder).await?,
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

    debug!(guild_id, "Persisting ticket settings updates into database");
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
        .await
        .map_err(|e| {
            warn!(error = ?e, guild_id, "Failed to persist new ticket configuration to database");
            e
        })?;

    ctx.send(
        CreateReply::default()
            .content("Ticket system has been set up successfully!")
            .ephemeral(true),
    )
        .await?;

    info!(
        guild_id,
        caller_id,
        target_channel_id,
        message_id,
        "Ticket system setup process completed successfully"
    );

    Ok(())
}