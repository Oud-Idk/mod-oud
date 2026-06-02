use crate::utils::config::get_settings;
use crate::{Data, Error, TicketInfo};
use serenity::all::{
    ChannelId, ChannelType, ComponentInteraction, Context, CreateChannel,
    CreateInteractionResponse, CreateInteractionResponseMessage, CreateMessage, Message,
    PermissionOverwrite, PermissionOverwriteType, Permissions, RoleId,
};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

pub async fn on_open_ticket(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Some(guild_id) = component.guild_id else {
        return Ok(());
    };
    let user_interact = &component.user;
    let settings = get_settings(&data.db, guild_id.get() as i64).await?;
    let role_id_config = match settings.ticket_role_id {
        Some(r) => r,
        None => {
            component.create_response(
                &ctx.http,
                CreateInteractionResponse::Message(
                    CreateInteractionResponseMessage::new()
                        .content("❌ Tickets cannot be opened because the staff role has not been configured by an administrator.")
                        .ephemeral(true),
                ),
            ).await?;
            return Ok(());
        }
    };
    let role_id = RoleId::new(role_id_config as u64);
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Defer(
                CreateInteractionResponseMessage::default().ephemeral(true),
            ),
        )
        .await?;

    let overwrites = vec![
        // Hide the channel from @everyone
        PermissionOverwrite {
            allow: Permissions::empty(),
            deny: Permissions::VIEW_CHANNEL,
            kind: PermissionOverwriteType::Role(RoleId::new(guild_id.get())),
        },
        // Allow the user who opened the ticket to view and write
        PermissionOverwrite {
            allow: Permissions::VIEW_CHANNEL
                | Permissions::SEND_MESSAGES
                | Permissions::READ_MESSAGE_HISTORY,
            deny: Permissions::empty(),
            kind: PermissionOverwriteType::Member(user_interact.id),
        },
        // Allow staff members to view and write
        PermissionOverwrite {
            allow: Permissions::VIEW_CHANNEL
                | Permissions::SEND_MESSAGES
                | Permissions::READ_MESSAGE_HISTORY,
            deny: Permissions::empty(),
            kind: PermissionOverwriteType::Role(role_id),
        },
    ];

    let mut channel_builder = CreateChannel::new(format!("ticket-{}", user_interact.name))
        .kind(ChannelType::Text)
        .permissions(overwrites);

    // Set parent category if configured
    if let Some(category_id) = settings.ticket_category_id {
        channel_builder = channel_builder.category(ChannelId::new(category_id as u64));
    }

    // Create the channel
    let ticket_channel = guild_id.create_channel(&ctx.http, channel_builder).await?;

    sqlx::query!(
        "INSERT INTO tickets (guild_id, channel_id, opener_id) VALUES ($1, $2, $3)",
        guild_id.get() as i64,
        ticket_channel.id.get() as i64,
        user_interact.id.get() as i64
    )
    .execute(&data.db)
    .await?;

    // Send a welcome message in the new channel with a "Close" button
    let welcome_embed = serenity::all::CreateEmbed::default()
        .title("Ticket Opened")
        .description(format!(
            "Hello <@{}>, welcome to your ticket. Please describe your issue. Support will be with you shortly.",
            user_interact.id,
        ))
        .color(0x2ECC71);

    let close_button = vec![serenity::all::CreateActionRow::Buttons(vec![
        serenity::all::CreateButton::new("close_ticket")
            .label("Close Ticket")
            .style(serenity::all::ButtonStyle::Danger)
            .emoji('🔒'),
    ])];

    let welcome_msg = ticket_channel
        .send_message(
            &ctx.http,
            CreateMessage::default()
                .embed(welcome_embed)
                .components(close_button),
        )
        .await?;

    {
        let mut active = data.active_tickets.lock().await;
        active.insert(
            ticket_channel.id,
            TicketInfo {
                message_count: 0,
                last_activity: tokio::time::Instant::now(),
                warned: false,
                last_button_message_id: Some(welcome_msg.id),
            },
        );
    }

    // Spawn background monitoring task
    let ctx_clone = ctx.clone();
    let data_clone = data.active_tickets.clone();
    let channel_id = ticket_channel.id;
    let db = data.db.clone();
    tokio::spawn(async move {
        if let Err(e) = monitor_ticket_inactivity(ctx_clone, data_clone, channel_id, db).await {
            eprintln!(
                "Error in inactivity monitor for channel {}: {:?}",
                channel_id, e
            );
        }
    });

    // Notify the user privately that their ticket is ready
    component
        .edit_response(
            &ctx.http,
            serenity::all::EditInteractionResponse::new().content(format!(
                "Your ticket has been created: <#{}>",
                ticket_channel.id
            )),
        )
        .await?;

    Ok(())
}

pub async fn on_close_ticket(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Defer(CreateInteractionResponseMessage::default()),
        )
        .await?;

    let channel_id = component.channel_id;

    sqlx::query!(
        "UPDATE tickets SET status = 'CLOSE', closed_at = NOW() WHERE channel_id = $1",
        channel_id.get() as i64
    )
    .execute(&data.db)
    .await?;

    // Send a warning that the ticket is closing, then delete the channel
    channel_id
        .send_message(
            &ctx.http,
            CreateMessage::default().content("Closing ticket and deleting channel in 5 seconds..."),
        )
        .await?;

    // Sleep briefly so users can see the deletion warning
    tokio::time::sleep(Duration::from_secs(5)).await;

    channel_id.delete(&ctx.http).await?;
    Ok(())
}
pub async fn monitor_ticket_inactivity(
    ctx: Context,
    active_tickets: Arc<Mutex<HashMap<ChannelId, TicketInfo>>>,
    channel_id: ChannelId,
    db: PgPool,
) -> Result<(), Error> {
    let check_interval = Duration::from_secs(30);
    let warning_timeout = Duration::from_secs(30 * 60);
    let close_timeout = Duration::from_secs(35 * 60);

    loop {
        tokio::time::sleep(check_interval).await;

        let mut tickets = active_tickets.lock().await;

        // If the ticket is no longer tracked (e.g., closed manually), stop this loop
        let ticket = match tickets.get_mut(&channel_id) {
            Some(t) => t,
            None => return Ok(()),
        };

        let elapsed = ticket.last_activity.elapsed();

        if elapsed >= close_timeout {
            // Drop the lock before executing network requests to avoid deadlock issues
            drop(tickets);

            let _ = channel_id
                .send_message(
                    &ctx.http,
                    CreateMessage::default()
                        .content("Ticket closed due to inactivity. Deleting channel..."),
                )
                .await;

            sqlx::query!(
                "UPDATE tickets SET status = 'CLOSE', closed_at = NOW() WHERE channel_id = $1",
                channel_id.get() as i64
            )
            .execute(&db)
            .await?;

            tokio::time::sleep(Duration::from_secs(5)).await;
            let _ = channel_id.delete(&ctx.http).await;

            // Cleanup tracking map
            let mut tickets = active_tickets.lock().await;
            tickets.remove(&channel_id);
            return Ok(());
        } else if elapsed >= warning_timeout && !ticket.warned {
            ticket.warned = true;
            drop(tickets); // Drop the lock before await

            let _ = channel_id
                .send_message(
                    &ctx.http,
                    CreateMessage::default().content(
                        "⚠️ This ticket has been inactive for 30 minutes. It will close in 5 minutes if there is no activity."
                    ),
                )
                .await;
        }
    }
}

pub async fn handle_tickets(ctx: &Context, message: &Message, data: &Data) -> Result<(), Error> {
    let channel_id = message.channel_id;
    let mut active = data.active_tickets.lock().await;

    let db_pool = data.db.clone();
    let channel_id_i64 = message.channel_id.get() as i64;
    let message_id_i64 = message.id.get() as i64;
    let author_id_i64 = message.author.id.get() as i64;
    let content = message.content.clone();

    tokio::spawn(async move {
        let result = sqlx::query!(
            "INSERT INTO ticket_messages (ticket_channel_id, message_id, author_id, content)
             VALUES ($1, $2, $3, $4)",
            channel_id_i64,
            message_id_i64,
            author_id_i64,
            content
        )
        .execute(&db_pool)
        .await;

        if let Err(e) = result {
            eprintln!("Failed to log ticket message to DB: {}", e);
        }
    });

    if let Some(ticket) = active.get_mut(&channel_id) {
        // Reset activity status since someone typed
        ticket.last_activity = tokio::time::Instant::now();
        ticket.warned = false;

        ticket.message_count += 1;

        if ticket.message_count >= 20 {
            ticket.message_count = 0;

            // Delete previous close button message to avoid multiple active buttons
            if let Some(old_msg_id) = ticket.last_button_message_id {
                let _ = channel_id.delete_message(&ctx.http, old_msg_id).await;
            }

            let close_button = vec![serenity::all::CreateActionRow::Buttons(vec![
                serenity::all::CreateButton::new("close_ticket")
                    .label("Close Ticket")
                    .style(serenity::all::ButtonStyle::Danger)
                    .emoji('🔒'),
            ])];

            if let Ok(new_msg) = channel_id
                .send_message(
                    &ctx.http,
                    CreateMessage::default()
                        .content(
                            "Still need help? You can close this ticket if your issue is resolved.",
                        )
                        .components(close_button),
                )
                .await
            {
                ticket.last_button_message_id = Some(new_msg.id);
            }
        }
    }
    Ok(())
}
