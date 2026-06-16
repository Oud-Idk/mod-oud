use crate::commands::messages::database::insert_reported_message;
use crate::commands::messages::utils;
use crate::types::payloads::{ReportStatus, ReportedMessagePayload};
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;

/// Core logic for saving a report to Postgres and publishing it to Redis Pub/Sub.
/// Returns the generated report ID, or None if the message was already reported by this user.
pub async fn issue_report(
    db: &sqlx::PgPool,
    redis_conn: &MultiplexedConnection,
    guild_id_u64: u64,
    channel_id_u64: u64,
    message: &serenity::all::Message,
    reporter: &serenity::all::User,
    reason: String,
) -> Result<Option<i32>, Box<dyn std::error::Error + Send + Sync>> {
    let author = &message.author;
    let message_id = message.id.to_string();
    let channel_id = channel_id_u64.to_string();
    let guild_id = guild_id_u64.to_string();
    let content = message.content.clone();
    let attachment_url = utils::extract_image_urls(message).join(",");

    let author_name = author.name.clone();
    let reporter_name = reporter.name.clone();

    let Some(row) = insert_reported_message(
        &db, &guild_id, &channel_id,
        &attachment_url, &reason,
        &reporter_name, &message, &reporter,
    ).await? else {
        return Ok(None);
    };

    let id = row.id;
    let status = ReportStatus::UnderReview;

    let payload = ReportedMessagePayload {
        id,
        guild_id,
        message_id,
        channel_id,
        reporter_name,
        author_name,
        reason,
        content,
        attachment_url,
        status,
        message_deleted: false,
        user_warned: false,
        user_timed_out: false,
        user_banned: false
    };

    let payload_str = serde_json::to_string(&payload)?;
    let mut redis_pub = redis_conn.clone();
    redis_pub.publish::<_, _, ()>("discord:reports", payload_str).await?;

    Ok(Some(row.id))
}