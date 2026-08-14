use crate::features::reporting::types::{ReportStatus, ReportUpdate, ReportedMessagePayload};
use axum::http::StatusCode;
use serenity::all::{Message, User};
use sqlx::{Error, PgPool};
use tracing::{error, warn};

pub struct Id {
    pub(crate) id: i64,
}

pub async fn insert_reported_message(
    db: &PgPool,
    guild_id: u64,
    channel_id: i64,
    attachment_url: &str,
    reason: &str,
    _reporter_name: &str,
    message: &Message,
    reporter: &User,
) -> Result<Option<Id>, Error> {
    let author = &message.author;
    let message_content = &message.content;
    let _author_name = &author.name;

    let message_id = message.id.get() as i64;
    let author_id = author.id.get() as i64;
    let reporter_id = reporter.id.get() as i64;

    sqlx::query_as!(
        Id,
        r#"
        INSERT INTO reported_messages (guild_id, channel_id, message_id, author_id, reporter_id, content, attachment_url, reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (message_id, reporter_id) DO NOTHING
        RETURNING id
        "#,
        guild_id.cast_signed(),
        channel_id,
        message_id,
        author_id,
        reporter_id,
        message_content,
        attachment_url,
        reason,
    )
        .fetch_optional(db)
        .await
}

pub async fn get_reported_message_by_id(pool: &PgPool, id: i64) -> Result<Option<ReportedMessagePayload>, Error> {
    sqlx::query_as!(
        ReportedMessagePayload,
        r#"
        SELECT
            id, guild_id, channel_id, message_id, author_id, reporter_id,
            content, attachment_url, reason,
            status as "status!: ReportStatus", message_deleted,
            user_warned, user_timed_out, user_banned
        FROM reported_messages
        WHERE id = $1
        "#,
        id
    )
        .fetch_optional(pool)
        .await
}

pub async fn fetch_target_report(
    pool: &PgPool,
    report_id: i64,
) -> Result<(poise::serenity_prelude::GuildId, poise::serenity_prelude::UserId, String), (StatusCode, String)> {
    let report = sqlx::query!(
        "SELECT guild_id, author_id FROM reported_messages WHERE id = $1",
        report_id
    )
        .fetch_optional(pool)
        .await
        .inspect_err(|e| error!(error = ?e, report_id, "Failed to fetch reported message by ID"))
        .map_err(|_e| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error.".to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Report ID not found".to_string()))?;

    let guild_id = serenity::all::GuildId::new(report.guild_id as u64);
    let user_id = serenity::all::UserId::new(report.author_id as u64);

    Ok((guild_id, user_id, "sample username".to_string()))
}

pub async fn update_reported_message(
    pool: &PgPool,
    report_id: i64,
    update: ReportUpdate,
) -> Result<(), (StatusCode, String)> {
    let result = match update {
        ReportUpdate::Status(status) => {
            let status_str = match status {
                ReportStatus::UnderReview => "UNDER_REVIEW",
                ReportStatus::Actioned => "ACTIONED",
                ReportStatus::Dismissed => "DISMISSED",
            };
            sqlx::query!(
                "UPDATE reported_messages SET status = $1::text::report_status WHERE id = $2",
                status_str,
                report_id
            )
                .execute(pool)
                .await
        }
        ReportUpdate::MessageDeleted => {
            sqlx::query!(
                "UPDATE reported_messages SET message_deleted = TRUE WHERE id = $1",
                report_id
            )
                .execute(pool)
                .await
        }
        ReportUpdate::UserWarned => {
            sqlx::query!(
                "UPDATE reported_messages SET user_warned = TRUE WHERE id = $1",
                report_id
            )
                .execute(pool)
                .await
        }
        ReportUpdate::UserTimedOut => {
            sqlx::query!(
                "UPDATE reported_messages SET user_timed_out = TRUE WHERE id = $1",
                report_id
            )
                .execute(pool)
                .await
        }
        ReportUpdate::UserBanned => {
            sqlx::query!(
                "UPDATE reported_messages SET user_banned = TRUE WHERE id = $1",
                report_id
            )
                .execute(pool)
                .await
        }
    };

    result
        .map(|_| ())
        .inspect_err(|e| warn!(error = ?e, "Failed to update reported message"))
        .map_err(|_e| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string()))
}