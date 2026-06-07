use crate::core::config::get_settings;
use crate::types::types::{Data, Error};
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
    let role_id = RoleId::new(role_id_config.parse::<u64>()?);

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
        channel_builder = channel_builder.category(ChannelId::new(category_id.parse::<u64>()?));
    }

    // 3. Create the channel in Discord
    let ticket_channel = guild_id.create_channel(&ctx.http, channel_builder).await?;

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

    let channel_id_str = ticket_channel.id.get().to_string();
    let ticket_key = format!("ticket:{}", channel_id_str);
    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string();

    // Acquire a connection to Redis (adjust this line to match your exact Redis client wrapper)
    let mut redis_conn = data.redis.clone();

    // Add to the active tickets set
    let _: () = redis::cmd("SADD")
        .arg("active_tickets")
        .arg(&channel_id_str)
        .query_async(&mut redis_conn)
        .await?;

    // Initialize the hash with count, activity timestamp, and last button message ID
    let _: () = redis::cmd("HSET")
        .arg(&ticket_key)
        .arg(&[
            ("message_count", "0"),
            ("last_activity", &now_ts),
            ("last_button_message_id", &welcome_msg_id_i64.to_string()),
        ])
        .query_async(&mut redis_conn)
        .await?;

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
    let channel_id_str = channel_id.get().to_string();

    sqlx::query!(
        "UPDATE tickets SET status = 'CLOSE', closed_at = NOW() WHERE channel_id = $1",
        channel_id.get() as i64
    )
        .execute(&data.db)
        .await?;

    let mut redis_conn = data.redis.clone();

    // Remove from the active tickets list
    let _: () = redis::cmd("SREM")
        .arg("active_tickets")
        .arg(&channel_id_str)
        .query_async(&mut redis_conn)
        .await?;

    // Delete the metadata hash
    let _: () = redis::cmd("DEL")
        .arg(format!("ticket:{}", channel_id_str))
        .query_async(&mut redis_conn)
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
    let channel_id_str = channel_id.get().to_string();
    let mut redis_conn = data.redis.clone();

    // 1. FAST PATH CHECK: Is this channel an active ticket?
    let is_active: bool = redis::cmd("SISMEMBER")
        .arg("active_tickets")
        .arg(&channel_id_str)
        .query_async(&mut redis_conn)
        .await
        .unwrap_or(false);

    if !is_active {
        return Ok(());
    }

    let channel_id_i64 = channel_id.get() as i64;
    let message_id_i64 = message.id.get() as i64;
    let author_id_i64 = message.author.id.get() as i64;
    let content = message.content.clone();

    // A. Log the message asynchronously to PostgreSQL (as before)
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

    // B. Increment message count and update last activity in Redis
    let ticket_key = format!("ticket:{}", channel_id_str);
    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string();

    let new_count: i32 = redis::cmd("HINCRBY")
        .arg(&ticket_key)
        .arg("message_count")
        .arg(1)
        .query_async(&mut redis_conn)
        .await?;

    let _: () = redis::cmd("HSET")
        .arg(&ticket_key)
        .arg("last_activity")
        .arg(&now_ts)
        .query_async(&mut redis_conn)
        .await?;

    // C. Handle rotating the close button if 20 messages have been sent
    if new_count >= 20 {
        // Retrieve the old button message ID stored in the Redis hash
        let old_msg_id_str: Option<String> = redis::cmd("HGET")
            .arg(&ticket_key)
            .arg("last_button_message_id")
            .query_async(&mut redis_conn)
            .await?;

        if let Some(old_id_str) = old_msg_id_str {
            if let Ok(old_id_u64) = old_id_str.parse::<u64>() {
                let old_msg_id = serenity::all::MessageId::new(old_id_u64);
                let _ = channel_id.delete_message(&ctx.http, old_msg_id).await;
            }
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

            // Sync the cached state back to PostgreSQL at this milestone
            sqlx::query!(
                r#"
                UPDATE tickets
                SET message_count = 0,
                    last_button_message_id = $1,
                    last_activity = CURRENT_TIMESTAMP,
                    warned = FALSE
                WHERE channel_id = $2
                "#,
                new_msg_id_i64,
                channel_id_i64
            )
                .execute(&data.db)
                .await?;

            // Reset Redis counter and save the new button message ID
            let _: () = redis::cmd("HSET")
                .arg(&ticket_key)
                .arg(&[
                    ("message_count", "0"),
                    ("last_button_message_id", &new_msg_id_i64.to_string()),
                ])
                .query_async(&mut redis_conn)
                .await?;
        }
    }

    Ok(())
}
