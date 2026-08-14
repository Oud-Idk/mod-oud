use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::tickets;
use crate::features::tickets::cache::{is_ticket_active, update_activity_redis};
use crate::features::tickets::types::TicketLogPayload;
use fred::clients::Client;
use serenity::all::{
    ChannelId, ComponentInteraction, Context, CreateInteractionResponse,
    CreateInteractionResponseMessage, CreateMessage, Message, MessageId, RoleId,
};
use tokio::sync::mpsc::UnboundedSender;
use tracing::{debug, info, instrument, trace};

/// Intercepts messages in active ticket channels, logging them to the database and rotating the close button when activity thresholds are reached.
#[instrument(
    skip(ctx, data, message),
    fields(
        msg_id = %message.id,
        channel_id = %message.channel_id,
        author = %message.author.id
    )
)]
pub async fn handle_tickets(ctx: &Context, message: &Message, data: &BotData) -> Result<(), Error> {
    if message.author.bot {
        return Ok(());
    }

    let channel_id = message.channel_id;
    let channel_id_str = channel_id.get().to_string();
    let Some(guild_id) = message.guild_id else {
        return Ok(());
    };

    let settings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id.get(),
    )
    .await?;

    let Some(ticket_config) = settings.tickets.as_ref().filter(|cfg| cfg.enabled) else {
        return Ok(());
    };

    if !is_ticket_active(data, channel_id.get()) {
        trace!("Message is not in an active ticket channel; skipping ticket logic");
        return Ok(());
    }

    debug!("Active ticket message intercepted. Evaluating staff roles.");

    let has_role = if let Some(role_id) = ticket_config.ticket_role_id {
        let role_id = RoleId::from(role_id);
        if let Some(ref member) = message.member {
            member.roles.contains(&role_id)
        } else if let Some(member) = ctx.cache.guild(guild_id).and_then(|g| g.members.get(&message.author.id).cloned()) {
            member.roles.contains(&role_id)
        } else {
            trace!("Cache miss for member roles; executing HTTP request to verify");
            message.author.has_role(ctx, guild_id, role_id).await?
        }
    } else {
        false // No staff role configured
    };

    trace!(
        has_role = has_role,
        "Logging message payload to database queue"
    );
    log_message_to_db(
        &data.ticket_log_tx,
        channel_id,
        message,
        message.author.name.clone(),
        has_role,
    );

    let ticket_key = format!("ticket:{channel_id_str}");
    let redis_conn = data.core.redis.clone();

    let bump_every_mins = (ticket_config.bump_every.as_secs() / 60) as i32;

    trace!("Updating Redis ticket activity tracking");
    let (should_rotate, last_button_id_str) =
        update_activity_redis(&redis_conn, &ticket_key, bump_every_mins).await?;

    if should_rotate {
        info!("Message threshold reached; rotating close button placement");
        rotate_close_button(
            ctx,
            data,
            &redis_conn,
            channel_id,
            &ticket_key,
            last_button_id_str,
        )
        .await?;
    }

    Ok(())
}

fn log_message_to_db(
    tx: &UnboundedSender<TicketLogPayload>,
    channel_id: ChannelId,
    message: &Message,
    username: String,
    is_ticket_manager: bool,
) {
    let payload = TicketLogPayload {
        ticket_channel_id: channel_id.get() as i64,
        message_id: message.id.get() as i64,
        author_id: message.author.id.get() as i64,
        content: message.content.clone(),
        sender_name: username,
        is_ticket_manager,
    };

    trace!("Sending ticket log payload to channels queue");
    let _ = tx.send(payload);
}

#[instrument(skip(ctx, data, redis))]
async fn rotate_close_button(
    ctx: &Context,
    data: &BotData,
    redis: &Client,
    channel_id: ChannelId,
    ticket_key: &str,
    old_button_id: Option<String>,
) -> Result<(), anyhow::Error> {
    if let Some(old_id_str) = old_button_id
        && let Ok(old_id_u64) = old_id_str.parse::<u64>()
    {
        debug!(old_id = %old_id_u64, "Deleting deprecated close button message");
        let _ = channel_id
            .delete_message(&ctx.http, MessageId::new(old_id_u64))
            .await;
    }

    let close_button = vec![serenity::all::CreateActionRow::Buttons(vec![
        serenity::all::CreateButton::new("close_ticket")
            .label("Close Ticket")
            .style(serenity::all::ButtonStyle::Danger)
            .emoji('🔒'),
    ])];

    debug!("Sending new close button dialog");
    let new_msg = channel_id
        .send_message(
            &ctx.http,
            CreateMessage::default()
                .content("Still need help? You can close this ticket if your issue is resolved.")
                .components(close_button),
        )
        .await?;

    let new_msg_id_i64 = new_msg.id.get() as i64;

    debug!("Updating message database and Redis states with new close button position");
    let db_update = tickets::database::update_close_button_db(&data, channel_id, new_msg_id_i64);
    let redis_update = tickets::cache::update_close_button_redis(redis, ticket_key, new_msg_id_i64);

    tokio::try_join!(db_update, redis_update)?;
    info!(new_msg_id = %new_msg_id_i64, "Close button placement rotated successfully");

    Ok(())
}

pub async fn send_missing_config_error(
    ctx: &Context,
    component: &ComponentInteraction,
) -> Result<(), Error> {
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new()
                    .content("❌ Tickets cannot be opened because the staff role has not been configured by an administrator.")
                    .ephemeral(true),
            ),
        )
        .await?;
    Ok(())
}

pub async fn send_disabled_error(
    ctx: &Context,
    component: &ComponentInteraction,
) -> Result<(), Error> {
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new()
                    .content("❌ Tickets are currently disabled in this guild.")
                    .ephemeral(true),
            ),
        )
        .await?;
    Ok(())
}
