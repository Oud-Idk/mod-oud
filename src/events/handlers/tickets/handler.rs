use crate::core::config::get_settings;
use crate::events::handlers::tickets::utils::{is_ticket_active, update_redis_activity};
use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{ChannelId, Context, CreateMessage, Message, MessageId};

pub async fn handle_tickets(ctx: &Context, message: &Message, data: &Data) -> Result<(), Error> {
    let channel_id = message.channel_id;
    let channel_id_str = channel_id.get().to_string();
    let Some(guild_id) = message.guild_id else { return Ok(()) };
    let mut redis_conn = data.redis.clone();
    let db = &data.db;
    let redis = &data.redis;
    let bump_every = get_settings(db, redis, guild_id.get() as i64)
        .await?
        .tickets
        .map(|v| v.bump_every)
        .unwrap_or(20);

    if !is_ticket_active(&mut redis_conn, &channel_id_str).await {
        return Ok(());
    }

    log_message_to_db(&data.db, channel_id, message);

    let ticket_key = format!("ticket:{}", channel_id_str);
    let (new_count, last_button_id_str) = update_redis_activity(&mut redis_conn, &ticket_key).await?;

    if new_count >= bump_every {
        rotate_close_button(ctx, data, &mut redis_conn, channel_id, &ticket_key, last_button_id_str).await?;
    }

    Ok(())
}

fn log_message_to_db(db_pool: &sqlx::PgPool, channel_id: ChannelId, message: &Message) {
    let pool = db_pool.clone();
    let channel_id_i64 = channel_id.get() as i64;
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
            .execute(&pool)
            .await;

        if let Err(e) = result {
            eprintln!("Failed to log ticket message to DB: {}", e);
        }
    });
}

async fn rotate_close_button(
    ctx: &Context,
    data: &Data,
    redis_conn: &mut redis::aio::MultiplexedConnection,
    channel_id: ChannelId,
    ticket_key: &str,
    old_button_id: Option<String>,
) -> Result<(), Error> {
    if let Some(old_id_str) = old_button_id {
        if let Ok(old_id_u64) = old_id_str.parse::<u64>() {
            let _ = channel_id.delete_message(&ctx.http, MessageId::new(old_id_u64)).await;
        }
    }

    let close_button = vec![serenity::all::CreateActionRow::Buttons(vec![
        serenity::all::CreateButton::new("close_ticket")
            .label("Close Ticket")
            .style(serenity::all::ButtonStyle::Danger)
            .emoji('🔒'),
    ])];

    let new_msg = channel_id
        .send_message(
            &ctx.http,
            CreateMessage::default()
                .content("Still need help? You can close this ticket if your issue is resolved.")
                .components(close_button),
        )
        .await?;

    let new_msg_id_i64 = new_msg.id.get() as i64;

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
        channel_id.get() as i64
    )
        .execute(&data.db)
        .await?;

    let _: () = redis::cmd("HSET")
        .arg(ticket_key)
        .arg(&[
            ("message_count", "0"),
            ("last_button_message_id", &new_msg_id_i64.to_string()),
        ])
        .query_async(redis_conn)
        .await?;

    Ok(())
}