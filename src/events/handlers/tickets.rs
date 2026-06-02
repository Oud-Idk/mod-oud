use crate::core::config::get_settings;
use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{
    ChannelId, ChannelType, ComponentInteraction, Context, CreateChannel,
    CreateInteractionResponse, CreateInteractionResponseMessage, CreateMessage, Message,
    PermissionOverwrite, PermissionOverwriteType, Permissions, RoleId,
};
use std::time::Duration;

pub async fn on_open_ticket(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &Data,
) -> Result<(), Error> {
    let Some(guild_id) = component.guild_id else {
        return Ok(());
    };
    let user_interact = &component.user;

    // 1. Get guild settings and check staff role configuration
    let settings = get_settings(&data.db, &data.redis, guild_id.get() as i64).await?;
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

    // Defer response to allow time for channel creation
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Defer(
                CreateInteractionResponseMessage::default().ephemeral(true),
            ),
        )
        .await?;

    // 2. Set up permission overwrites
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

    // 3. Create the channel in Discord
    let ticket_channel = guild_id.create_channel(&ctx.http, channel_builder).await?;

    // 4. Send a welcome message in the new channel with a "Close" button
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

    // 5. Insert the ticket into the database.
    // By saving the `welcome_msg.id` directly upon creation, we keep the DB state completely synchronized.
    let welcome_msg_id_i64 = welcome_msg.id.get() as i64;
    sqlx::query!(
        r#"
        INSERT INTO tickets (guild_id, channel_id, opener_id, last_button_message_id)
        VALUES ($1, $2, $3, $4)
        "#,
        guild_id.get() as i64,
        ticket_channel.id.get() as i64,
        user_interact.id.get() as i64,
        welcome_msg_id_i64
    )
    .execute(&data.db)
    .await?;

    // (Note: The in-memory map write and monitor loop `tokio::spawn` have been removed here)

    // 6. Confirm the channel link to the user who clicked the button
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

pub async fn handle_tickets(ctx: &Context, message: &Message, data: &Data) -> Result<(), Error> {
    let channel_id = message.channel_id;
    let channel_id_i64 = channel_id.get() as i64;
    let message_id_i64 = message.id.get() as i64;
    let author_id_i64 = message.author.id.get() as i64;
    let content = message.content.clone();

    let ticket_update = sqlx::query!(
        r#"
        UPDATE tickets
        SET last_activity = CURRENT_TIMESTAMP,
            warned = FALSE,
            message_count = message_count + 1
        WHERE channel_id = $1 AND status = 'OPEN'
        RETURNING message_count, last_button_message_id
        "#,
        channel_id_i64
    )
    .fetch_optional(&data.db)
    .await?;

    // If the query returned a row, this IS an open ticket channel
    if let Some(ticket) = ticket_update {
        // A. Log the message asynchronously to ticket_messages to keep the message loop fast
        let db_pool = data.db.clone();
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

        // B. Handle rotating the close button if 20 messages have been sent
        if ticket.message_count.unwrap_or(0) >= 20 {
            // Delete previous close button message to avoid multiple active buttons
            if let Some(old_msg_id_i64) = ticket.last_button_message_id {
                let old_msg_id = serenity::all::MessageId::new(old_msg_id_i64 as u64);
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
                let new_msg_id_i64 = new_msg.id.get() as i64;

                // Reset message count and save the new button message ID
                sqlx::query!(
                    r#"
                    UPDATE tickets
                    SET message_count = 0,
                        last_button_message_id = $1
                    WHERE channel_id = $2
                    "#,
                    new_msg_id_i64,
                    channel_id_i64
                )
                .execute(&data.db)
                .await?;
            }
        }
    }

    Ok(())
}
