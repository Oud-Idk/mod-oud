// src/jobs/dashboard_commands.rs

use crate::utils::moderating::issue_warning;
use futures_util::StreamExt;
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};
use serenity::Http;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "report_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ReportStatus {
    UnderReview,
    Actioned,
    Dismissed,
}

#[derive(Deserialize, Debug)]
struct DashboardCommand {
    #[serde(flatten)]
    action: DashboardAction,
    report_id: i32,
    moderator_id: Option<String>,
    reason: Option<String>,
    duration_mins: Option<u64>,
    status: Option<ReportStatus>, // New optional status field for manual resolution
}

#[derive(Serialize)]
struct ReportedMessagePayload {
    id: i32,
    guild_id: String,
    channel_id: String,
    message_id: String,
    reporter_name: String,
    author_name: String,
    reason: String,
    message_content: String,
    content: String,
    attachment_url: String,
    status: ReportStatus,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum DashboardAction {
    ResolveReport { status: ReportStatus },
    DeleteMessage { channel_id: String, message_id: String },
    WarnUser { moderator_id: Option<String>, reason: Option<String> },
    TimeoutUser { duration_mins: u64 },
    BanUser,
}

pub fn start_dashboard_command_worker(
    pool: sqlx::PgPool,
    http: Arc<Http>,
    redis_client: redis::Client,
) {
    tokio::spawn(async move {
        let mut pubsub = match redis_client.get_async_pubsub().await {
            Ok(p) => p,
            Err(e) => return eprintln!("Failed to initialize Redis PubSub: {e}"),
        };

        if let Err(e) = pubsub.subscribe("discord:commands").await {
            return eprintln!("Failed to subscribe to commands channel: {e}");
        }

        let mut msg_stream = pubsub.on_message();

        while let Some(msg) = msg_stream.next().await {
            if let Ok(payload_str) = msg.get_payload::<String>() {
                let pool = pool.clone();
                let http = Arc::clone(&http);
                let redis_client = redis_client.clone();

                tokio::spawn(async move {
                    if let Err(e) = process_dashboard_command(&payload_str, &pool, &http, &redis_client).await {
                        eprintln!("Error processing dashboard command: {}", e);
                    }
                });
            }
        }
    });
}

async fn process_dashboard_command(
    payload: &str,
    pool: &sqlx::PgPool,
    http: &Arc<Http>,
    redis: &redis::Client,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> { // Or anyhow::Result
    let cmd: DashboardCommand = serde_json::from_str(payload)?;

    // Only select what we strictly need right now.
    let report = sqlx::query!(
        "SELECT guild_id, author_id FROM reported_messages WHERE id = $1",
        cmd.report_id
    )
        .fetch_optional(pool)
        .await?
        .ok_or("Report ID not found in database")?;

    let guild_id = serenity::GuildId::new(report.guild_id.parse()?);
    let user_id = serenity::UserId::new(report.author_id.parse()?);

    match cmd.action {
        DashboardAction::ResolveReport { status } => {
            handle_resolve_report(pool, redis, cmd.report_id, status).await?;
        }
        DashboardAction::DeleteMessage { channel_id, message_id } => {
            let ch_id = serenity::ChannelId::new(channel_id.parse()?);
            let msg_id = serenity::MessageId::new(message_id.parse()?);

            // 1. Delete the message on Discord
            http.delete_message(ch_id, msg_id, Some("Deleted via Moderation Dashboard")).await?;

            // 2. Update the DB and broadcast the update to the frontend via SSE
            handle_resolve_report(pool, redis, cmd.report_id, ReportStatus::Actioned).await?;
        }
        DashboardAction::WarnUser { moderator_id, reason } => {
            let mod_id_val = moderator_id.and_then(|id| id.parse::<u64>().ok()).unwrap_or(0);
            let reason_str = reason.unwrap_or_else(|| "No reason specified".to_string());

            let redis_conn = redis.get_multiplexed_async_connection().await?;

            issue_warning(
                pool,
                &redis_conn,
                http,
                guild_id,
                user_id,
                serenity::UserId::new(mod_id_val),
                &reason_str,
            ).await?;
        }
        DashboardAction::TimeoutUser { duration_mins } => {
            let future_secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs() + (duration_mins * 60);
            let timestamp = serenity::Timestamp::from_unix_timestamp(future_secs as i64)?;

            let edit = serenity::EditMember::new().disable_communication_until_datetime(timestamp);
            http.edit_member(guild_id, user_id, &edit, Some("Timeout applied via Moderation Dashboard")).await?;
        }
        DashboardAction::BanUser => {
            http.ban_user(guild_id, user_id, 7, Some("Banned via Moderation Dashboard")).await?;
        }
    }

    Ok(())
}

/// Abstracted out the messy DB Update & SSE Publisher
async fn handle_resolve_report(
    pool: &sqlx::PgPool,
    redis: &redis::Client,
    report_id: i32,
    status: ReportStatus,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let status_str = match status {
        ReportStatus::UnderReview => "under_review",
        ReportStatus::Actioned => "actioned",
        ReportStatus::Dismissed => "dismissed",
    };

    let row = sqlx::query!(
        r#"
        UPDATE reported_messages
        SET status = $1::text::report_status
        WHERE id = $2
        RETURNING id, guild_id, channel_id, message_id, author_id, reporter_id, message_content, attachment_url, reason, author_name, reporter_name, status as "status!: ReportStatus"
        "#,
        status_str,
        report_id
    )
        .fetch_optional(pool)
        .await?
        .ok_or("Failed to update report status")?;

    let sse_update = ReportedMessagePayload {
        id: row.id,
        guild_id: row.guild_id,
        channel_id: row.channel_id,
        message_id: row.message_id,
        reporter_name: row.reporter_name,
        author_name: row.author_name,
        reason: row.reason,
        message_content: row.message_content.clone(),
        content: row.message_content,
        attachment_url: row.attachment_url.unwrap_or_default(),
        status: row.status,
    };

    let sse_payload = serde_json::to_string(&sse_update)?;
    let mut conn = redis.get_multiplexed_async_connection().await?;

    // We can use the simple query_async shortcut rather than matching
    let _: () = redis::cmd("PUBLISH")
        .arg("discord:reports")
        .arg(&sse_payload)
        .query_async(&mut conn)
        .await?;

    Ok(())
}
