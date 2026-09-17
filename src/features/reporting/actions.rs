use std::sync::Arc;
use crate::features::reporting::cache;
use crate::features::reporting::database::insert_reported_message;
use crate::features::reporting::types::{ReportStatus, ReportedMessagePayload};
use crate::shared::store_username_relation;
use crate::shared::username_cache::UserUpdate;
use anyhow::Result;
use fred::clients::Client;
use futures_util::TryFutureExt;
use serenity::all::{CreateMessage, GuildId, Http, Message, User};
use tokio::sync::mpsc;
use tracing::{debug, trace, warn};
use crate::core::config::settings::GuildSettings;

pub fn extract_image_urls(message: &Message) -> Vec<String> {
    let mut urls = Vec::new();

    for attachment in &message.attachments {
        let is_image = attachment
            .content_type
            .as_deref()
            .is_some_and(|mime| mime.starts_with("image/"))
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

pub struct ReportMetadata<'a> {
    pub(crate) guild_id: GuildId,
    pub(crate) reported_message: &'a Message,
    pub(crate) reporter: &'a User,
    pub(crate) reason: String,
}

/// Core logic for saving a report to Postgres and publishing it to Redis Pub/Sub.
/// Returns the generated report ID, or None if the message was already reported by this user.
pub async fn issue_report(
    db: &sqlx::PgPool,
    redis: &Client,
    username_buf: &mpsc::Sender<UserUpdate>,
    report_metadata: ReportMetadata<'_>,
    config: &GuildSettings,
    http: Arc<Http>,
    domain: &str,
) -> Result<Option<i64>> {
    let ReportMetadata {
        guild_id, reported_message, reporter, reason,
    } = report_metadata;

    trace!(
        %guild_id,
        message_id = %reported_message.id,
        reporter_id = %reporter.id,
        "Starting issue_report process"
    );

    let reported_author = &reported_message.author;
    store_username_relation(username_buf, reported_author.id, &reported_author.name).await?;
    store_username_relation(username_buf, reporter.id, &reporter.name).await?;

    let content = reported_message.content.clone();
    let attachment_url = extract_image_urls(reported_message).join(",");

    trace!("Attempting to insert reported message into the database");
    let Some(row) = insert_reported_message(
        db,
        guild_id,
        reported_message.channel_id,
        &attachment_url,
        &reason,
        reported_message,
        reporter,
    )
    .await?
    else {
        debug!(
            message_id = reported_message.id.get(),
            reporter_id = reporter.id.get(),
            "Report creation skipped: message was already reported by this user"
        );
        return Ok(None);
    };

    let id = row.id;
    debug!(
        report_id = id,
        "Successfully saved reported message to database"
    );

    let payload = ReportedMessagePayload {
        id,
        guild_id,
        message_id: reported_message.id,
        author_id: reported_message.author.id,
        author_name: reported_author.name.clone(),
        channel_id: reported_message.channel_id,
        reason,
        content,
        attachment_url: Some(attachment_url),
        status: ReportStatus::UnderReview,
        message_deleted: false.into(),
        user_warned: false.into(),
        user_timed_out: false.into(),
        user_banned: false.into(),
        reporter_id: reporter.id,
        reporter_name: reporter.name.clone(),
    };

    trace!(report_id = id, "Serializing report payload to JSON");
    let payload_str = serde_json::to_string(&payload).map_err(|err| {
        warn!(error = ?err, report_id = id, "Failed to serialize report payload to JSON");
        err
    })?;

    debug!(
        report_id = id,
        "Publishing report payload to Redis 'discord:reports' channel"
    );

    cache::publish_report(redis, &payload_str)
        .map_err(|err| {
            warn!(error = ?err, report_id = id, "Failed to publish report to Redis Pub/Sub");
            err
        })
        .await?;

    send_message_to_channel(http, &config, reported_message, guild_id, domain).await?;

    debug!(
        report_id = id,
        "Successfully completed report processing and transmission"
    );
    Ok(Some(row.id))
}

async fn send_message_to_channel(http: Arc<Http>, config: &GuildSettings, message: &Message, guild_id: GuildId, domain: &str) -> Result<()> {
    let Some(config) = config.report.as_deref() else { return Ok(()); };
    debug!(
        ?config,
        "Attempting to send alert to channel"
    );
    let Some(reporting_channel) = config.reporting_channel else { return Ok(()); };
    let message_url = message.link();
    let dashboard_url = format!("{}/dashboard/{guild_id}/report", domain);



    reporting_channel.send_message(&http, CreateMessage::new()
        .content(format!("Someone reported a message! Message located at {message_url}. Head to {dashboard_url} to resolve."))
    ).await?;
    Ok(())
}