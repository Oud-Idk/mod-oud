use crate::commands::messages::database::insert_reported_message;
use crate::commands::messages::{database, utils};
use crate::types::payloads::{ReportStatus, ReportedMessagePayload};
use crate::utils::store_username_relation;
use fred::prelude::*;
use futures_util::TryFutureExt;
use tracing::{debug, trace, warn};

/// Core logic for saving a report to Postgres and publishing it to Redis Pub/Sub.
/// Returns the generated report ID, or None if the message was already reported by this user.
pub async fn issue_report(
    db: &sqlx::PgPool,
    redis: &Client,
    guild_id: i64,
    channel_id: i64,
    message: &serenity::all::Message,
    reporter: &serenity::all::User,
    reason: String,
) -> Result<Option<i64>, Box<dyn std::error::Error + Send + Sync>> {
    trace!(
        guild_id = guild_id,
        channel_id = channel_id,
        message_id = message.id.get(),
        reporter_id = reporter.id.get(),
        "Starting issue_report process"
    );

    let author = &message.author;
    let message_id = message.id.get() as i64;
    let content = message.content.clone();
    let attachment_url = utils::extract_image_urls(message).join(",");

    let author_name = author.name.clone();
    let author_id = author.id.get() as i64;
    let reporter_name = reporter.name.clone();

    trace!("Attempting to insert reported message into the database");
    let Some(row) = insert_reported_message(
        db,
        guild_id,
        channel_id,
        &attachment_url,
        &reason,
        &reporter_name,
        message,
        reporter,
    )
        .await? else {
        debug!(
            message_id = message.id.get(),
            reporter_id = reporter.id.get(),
            "Report creation skipped: message was already reported by this user"
        );
        return Ok(None);
    };

    store_username_relation(db, redis, author.id.get(), &author_name).await?;

    let id = row.id;
    debug!(report_id = id, "Successfully saved reported message to database");

    let status = ReportStatus::UnderReview;

    let payload = ReportedMessagePayload {
        id,
        guild_id,
        message_id,
        author_id,
        channel_id,
        reason,
        content,
        attachment_url: Some(attachment_url),
        status,
        message_deleted: false,
        user_warned: false,
        user_timed_out: false,
        user_banned: false,
        reporter_id: 0,
    };

    trace!(report_id = id, "Serializing report payload to JSON");
    let payload_str = serde_json::to_string(&payload).map_err(|err| {
        warn!(error = ?err, report_id = id, "Failed to serialize report payload to JSON");
        err
    })?;

    debug!(report_id = id, "Publishing report payload to Redis 'discord:reports' channel");

    database::publish_report(redis, &payload_str)
        .map_err(|err| {
            warn!(error = ?err, report_id = id, "Failed to publish report to Redis Pub/Sub");
            err
        }).await?;

    debug!(report_id = id, "Successfully completed report processing and transmission");
    Ok(Some(row.id))
}

