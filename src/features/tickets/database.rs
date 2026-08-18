use crate::core::config::state::{BotData, Error};
use crate::features::tickets::TicketLogPayload;
use anyhow::Result;
use chrono::{DateTime, Utc};
use serenity::all::{ChannelId, GuildId, UserId};
use sqlx::{PgPool, Postgres, Row, Transaction};
use std::result;
use tracing::{instrument, trace};

pub async fn mark_ticket_as_closed_db(data: &&BotData, channel_id: ChannelId) -> Result<()> {
    sqlx::query!(
        "UPDATE tickets SET status = 'CLOSED', closed_at = NOW() WHERE channel_id = $1",
        channel_id.get() as i64
    )
        .execute(&data.core.db)
        .await?;
    Ok(())
}

pub async fn update_close_button_db(data: &&BotData, channel_id: ChannelId, new_msg_id_i64: i64) -> Result<()> {
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
        .execute(&data.core.db)
        .await?;

    Ok(())
}

#[instrument(skip(data))]
pub async fn save_ticket_to_db(
    data: &BotData,
    guild_id: GuildId,
    channel_id: ChannelId,
    user_id: UserId,
    welcome_msg_id: serenity::all::MessageId,
    username: &str,
) -> Result<(), Error> {
    trace!("Executing database write for ticket registration");
    sqlx::query!(
        r#"
        INSERT INTO tickets (guild_id, channel_id, opener_id, last_button_message_id)
        VALUES ($1, $2, $3, $4)
        "#,
        guild_id.get().cast_signed(),
        channel_id.get() as i64,
        user_id.get() as i64,
        welcome_msg_id.get() as i64,
    )
        .execute(&data.core.db)
        .await?;
    Ok(())
}


#[derive(Debug, Clone)]
pub struct InactiveTicket {
    pub channel_id: ChannelId,
    pub guild_id: GuildId,
    pub last_activity: Option<DateTime<Utc>>,
}

pub async fn fetch_inactive_tickets(
    pool: &PgPool,
    safety_threshold: DateTime<Utc>,
) -> Result<Vec<InactiveTicket>> {
    let rows = sqlx::query!(
        r#"
        SELECT channel_id, guild_id, last_activity
        FROM tickets
        WHERE status = 'OPEN' AND warned = FALSE AND last_activity < $1
        LIMIT 100
        "#,
        safety_threshold
    )
        .fetch_all(pool)
        .await?;

    let candidates = rows
        .into_iter()
        .map(|row| InactiveTicket {
            channel_id: ChannelId::new(row.channel_id as u64),
            guild_id: GuildId::new(row.guild_id as u64),
            last_activity: row.last_activity,
        })
        .collect();

    Ok(candidates)
}

pub async fn mark_ticket_as_warned(pool: &PgPool, target_ids: &[ChannelId]) -> Result<()> {
    if target_ids.is_empty() {
        return Ok(());
    }

    let ids: Vec<i64> = target_ids.iter().map(|id| id.get().cast_signed()).collect();

    sqlx::query!(
        "UPDATE tickets SET warned = TRUE WHERE channel_id = ANY($1)",
        &ids as &[i64]
    )
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn fetch_closing_candidates(
    pool: &PgPool,
    safety_threshold: DateTime<Utc>,
) -> Result<Vec<InactiveTicket>> {
    let rows = sqlx::query!(
        r#"
        SELECT channel_id, guild_id, last_activity
        FROM tickets
        WHERE status = 'OPEN' AND warned = TRUE AND last_activity < $1
        LIMIT 100
        "#,
        safety_threshold
    )
        .fetch_all(pool)
        .await?;

    let candidates = rows
        .into_iter()
        .map(|row| InactiveTicket {
            channel_id: ChannelId::new(row.channel_id as u64),
            guild_id: GuildId::new(row.guild_id as u64),
            last_activity: row.last_activity,
        })
        .collect();

    Ok(candidates)
}

pub async fn mark_ticket_as_closed(pool: &PgPool, tickets_to_close: &[ChannelId]) -> Result<()> {
    if tickets_to_close.is_empty() {
        return Ok(());
    }

    let ids: Vec<i64> = tickets_to_close.iter().map(|id| id.get() as i64).collect();

    sqlx::query!(
        "UPDATE tickets SET status = 'CLOSED' WHERE channel_id = ANY($1)",
        &ids as &[i64]
    )
        .execute(pool)
        .await?;

    Ok(())
}

/// Flushes a batch of ticket log payloads into the database inside a single transaction.
pub async fn flush_ticket_logs_to_db(
    pool: &PgPool,
    records: &[TicketLogPayload],
) -> result::Result<(), sqlx::Error> {
    if records.is_empty() {
        return Ok(());
    }

    let mut chan_ids = Vec::with_capacity(records.len());
    let mut msg_ids = Vec::with_capacity(records.len());
    let mut auth_ids = Vec::with_capacity(records.len());
    let mut contents = Vec::with_capacity(records.len());
    let mut managers = Vec::with_capacity(records.len());

    for rec in records {
        chan_ids.push(rec.ticket_channel_id.get() as i64);
        msg_ids.push(rec.message_id.get() as i64);
        auth_ids.push(rec.author_id.get() as i64);
        contents.push(rec.content.clone());
        managers.push(rec.is_ticket_manager);
    }

    let mut tx = pool.begin().await?;

    bulk_insert_ticket_messages(
        &mut tx,
        &chan_ids,
        &msg_ids,
        &auth_ids,
        &contents,
        &managers,
    )
        .await?;

    bulk_increment_ticket_message_counts(&mut tx, &chan_ids).await?;

    tx.commit().await?;
    Ok(())
}

/// Bulk inserts ticket messages using PostgreSQL UNNEST.
async fn bulk_insert_ticket_messages(
    tx: &mut Transaction<'_, Postgres>,
    chan_ids: &[i64],
    msg_ids: &[i64],
    auth_ids: &[i64],
    contents: &[String],
    managers: &[bool],
) -> result::Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO ticket_messages (ticket_channel_id, message_id, author_id, content, is_ticket_manager)
        SELECT * FROM UNNEST($1::bigint[], $2::bigint[], $3::bigint[], $4::text[], $5::boolean[])
        "#,
        chan_ids,
        msg_ids,
        auth_ids,
        contents,
        managers
    )
        .execute(&mut **tx)
        .await?;

    Ok(())
}

/// Bulk increments message counts on parent ticket rows.
async fn bulk_increment_ticket_message_counts(
    tx: &mut Transaction<'_, Postgres>,
    chan_ids: &[i64],
) -> result::Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        UPDATE tickets t
        SET message_count = t.message_count + sub.cnt
        FROM (
            SELECT ticket_channel_id, COUNT(*) as cnt
            FROM UNNEST($1::bigint[]) AS ticket_channel_id
            GROUP BY ticket_channel_id
        ) sub
        WHERE t.channel_id = sub.ticket_channel_id;
        "#,
        chan_ids
    )
        .execute(&mut **tx)
        .await?;

    Ok(())
}