use crate::types::dashboard::ReportUpdate;
use crate::types::payloads::{ReportStatus, ReportedMessagePayload};
use axum::http::StatusCode;
use poise::serenity_prelude as serenity;
use sqlx::{Error, PgPool};

pub async fn fetch_target_report(
    pool: &PgPool,
    report_id: i64,
) -> Result<(poise::serenity_prelude::GuildId, poise::serenity_prelude::UserId, String), (StatusCode, String)> {
    let report = sqlx::query!(
        "SELECT guild_id, author_id, author_name FROM reported_messages WHERE id = $1",
        report_id
    )
        .fetch_optional(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Report ID not found".to_string()))?;

    let guild_id = serenity::GuildId::new(report.guild_id as u64);
    let user_id = serenity::UserId::new(report.author_id as u64);

    Ok((guild_id, user_id, report.author_name))
}

pub async fn update_reported_message(
    pool: &PgPool,
    report_id: i64,
    update: ReportUpdate,
) -> Result<(), (StatusCode, String)> {
    let result = match update {
        ReportUpdate::Status(status) => {
            let status_str = match status {
                ReportStatus::UnderReview => "under_review",
                ReportStatus::Actioned => "actioned",
                ReportStatus::Dismissed => "dismissed",
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
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn get_reported_message_by_id(pool: &PgPool, id: i64) -> Result<Option<ReportedMessagePayload>, Error> {
    sqlx::query_as!(
        ReportedMessagePayload,
        r#"
        SELECT
            id, guild_id, channel_id, message_id, author_id, reporter_id,
            content, attachment_url, reason, author_name, reporter_name,
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