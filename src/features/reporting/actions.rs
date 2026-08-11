use crate::features::reporting::cache;
use crate::features::reporting::database::insert_reported_message;
use crate::features::reporting::types::{ReportStatus, ReportedMessagePayload};
use crate::shared::store_username_relation;
use crate::shared::username_cache::UserUpdate;
use anyhow::Result;
use fred::clients::Client;
use futures_util::TryFutureExt;
use tracing::{debug, trace, warn};

pub fn extract_image_urls(message: &serenity::all::Message) -> Vec<String> {
    let mut urls = Vec::new();

    for attachment in &message.attachments {
        let is_image = attachment.content_type
            .as_deref()
            .map_or(false, |mime| mime.starts_with("image/"))
            || attachment.dimensions().is_some();

        if is_image {
            urls.push(attachment.url.clone());
        }
    }

    for embed in &message.embeds {
        if let Some(image) = &embed.image {
            urls.push(image.url.clone());
        }
        if let Some(thumbnail) = &embed.thumbnail {
            urls.push(thumbnail.url.clone());
        }
    }

    urls
}

/// Core logic for saving a report to Postgres and publishing it to Redis Pub/Sub.
/// Returns the generated report ID, or None if the message was already reported by this user.
pub async fn issue_report(
    db: &sqlx::PgPool,
    redis: &Client,
    username_buf: &tokio::sync::mpsc::Sender<UserUpdate>,
    guild_id: i64,
    channel_id: i64,
    message: &serenity::all::Message,
    reporter: &serenity::all::User,
    reason: String,
) -> Result<Option<i64>> {
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
    let attachment_url = extract_image_urls(message).join(",");

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

    store_username_relation(username_buf, author.id.get(), &author_name).await?;

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

    cache::publish_report(redis, &payload_str)
        .map_err(|err| {
            warn!(error = ?err, report_id = id, "Failed to publish report to Redis Pub/Sub");
            err
        }).await?;

    debug!(report_id = id, "Successfully completed report processing and transmission");
    Ok(Some(row.id))
}