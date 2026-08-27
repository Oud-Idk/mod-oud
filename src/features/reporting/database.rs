use crate::features::reporting::types::{ReportStatus, ReportUpdate, ReportedMessagePayload};
use axum::http::StatusCode;
use serenity::all::{ChannelId, GuildId, Message, MessageId, User, UserId};
use sqlx::PgPool;
use tracing::{error, warn};

pub struct Id {
    pub(crate) id: i64,
}

pub async fn insert_reported_message(
    db: &PgPool,
    guild_id: GuildId,
    channel_id: ChannelId,
    attachment_url: &str,
    reason: &str,
    reported_message: &Message,
    reporter: &User,
) -> Result<Option<Id>, sqlx::Error> {
    let author = &reported_message.author;
    let message_content = &reported_message.content;

    sqlx::query_as!(
        Id,
        r#"
        INSERT INTO reported_messages (guild_id, channel_id, message_id, author_id, reporter_id, content, attachment_url, reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (message_id, reporter_id) DO NOTHING
        RETURNING id
        "#,
        guild_id.get().cast_signed(),
        channel_id.get().cast_signed(),
        reported_message.id.get().cast_signed(),
        author.id.get().cast_signed(),
        reporter.id.get().cast_signed(),
        message_content,
        attachment_url,
        reason,
    )
        .fetch_optional(db)
        .await
}

pub async fn get_reported_message_by_id(
    pool: &PgPool,
    id: i64,
) -> Result<Option<ReportedMessagePayload>, sqlx::Error> {
    let row = sqlx::query!(
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
    .await?;

    Ok(row.map(|r| ReportedMessagePayload {
        id: r.id,
        guild_id: GuildId::new(r.guild_id.cast_unsigned()),
        channel_id: ChannelId::new(r.channel_id.cast_unsigned()),
        message_id: MessageId::new(r.message_id.cast_unsigned()),
        author_id: UserId::new(r.author_id.cast_unsigned()),
        reporter_id: UserId::new(r.reporter_id.cast_unsigned()),
        content: r.content,
        attachment_url: r.attachment_url,
        reason: r.reason,
        status: r.status,
        message_deleted: r.message_deleted.into(),
        user_warned: r.user_warned.into(),
        user_timed_out: r.user_timed_out.into(),
        user_banned: r.user_banned.into(),
    }))
}

pub async fn fetch_target_report(
    pool: &PgPool,
    report_id: i64,
) -> Result<(GuildId, UserId), (StatusCode, String)> {
    let report = sqlx::query!(
        "SELECT guild_id, author_id FROM reported_messages WHERE id = $1",
        report_id
    )
    .fetch_optional(pool)
    .await
    .inspect_err(|e| error!(error = ?e, report_id, "Failed to fetch reported message by ID"))
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "Report ID not found".to_string()))?;

    let guild_id = GuildId::new(report.guild_id.cast_unsigned());
    let user_id = UserId::new(report.author_id.cast_unsigned());

    Ok((guild_id, user_id))
}

pub async fn fetch_reporter_id(
    pool: &PgPool,
    report_id: i64,
) -> Result<UserId, (StatusCode, String)> {
    let reporter_id = sqlx::query_scalar!(
        "SELECT reporter_id FROM reported_messages WHERE id = $1",
        report_id
    )
    .fetch_optional(pool)
    .await
    .inspect_err(|e| error!(error = ?e, report_id, "Failed to fetch reporter ID for report"))
    .map_err(|_e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "Report ID not found".to_string()))?;

    Ok(UserId::new(reporter_id.cast_unsigned()))
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
        .map_err(|_e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error".to_string(),
            )
        })
}
