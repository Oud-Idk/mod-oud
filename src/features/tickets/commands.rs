use crate::core::config::settings::get_settings;
use crate::core::config::state::{Context, Error};
use crate::features::tickets::panel::build_ticket_message_payload;
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
    let guild_id = ctx.guild_id().unwrap().get();
    let caller_id = ctx.author().id.get();

    info!(
        caller_id,
        guild_id, "Moderator invoked setup_tickets slash command"
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
            guild_id,
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
        .map(|c| c.id.get())
        .or_else(|| settings.tickets.as_ref().and_then(|t| t.category_id))
    else {
        debug!(
            guild_id,
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
        .map(|r| r.id.get())
        .or_else(|| settings.tickets.as_ref().and_then(|t| t.ticket_role_id))
    else {
        debug!(
            guild_id,
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

    let target_channel_id: u64 = match &channel {
        Some(c) => c.id.get(),
        None => ctx.channel_id().get(),
    };

    let serenity_guild_id = serenity::GuildId::new(guild_id as u64);

    debug!(guild_id, "Compiling ticket panel layouts and assets");
    let message_builder = if let Some(ref ticket_cfg) = settings.tickets {
        build_ticket_message_payload(
            ctx.http(),
            serenity_guild_id,
            ticket_role_id,
            ticket_cfg.panel_message.message.format,
            &ticket_cfg.panel_message.message.content,
            &ticket_cfg.panel_message.message.embed,
        )
        .await?
    } else {
        debug!(guild_id, "Ticket setup blocked: no message configured");
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
        guild_id,
        target_channel_id, "Dispatching ticket panel message to Discord API"
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
        guild_id.cast_signed(),
        serde_json::json!({
            "tickets": tickets_payload
        }),
    )
    .execute(&ctx.data().core.db)
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
