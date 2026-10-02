use crate::features::reporting::moderation::ActionError;
use crate::features::reporting::types::{ReportStatus, ReportUpdate, ReportedMessagePayload};
use serenity::all::{ChannelId, GuildId, Message, MessageId, User, UserId};
use sqlx::PgPool;
use tracing::warn;

#[derive(sqlx::FromRow)]
struct RawReportedMessage {
    id: i64,
    guild_id: i64,
    channel_id: i64,
    message_id: i64,
    author_id: i64,
    author_name: Option<String>,
    reporter_id: i64,
    reporter_name: Option<String>,
    content: String,
    attachment_url: Option<String>,
    reason: String,
    status: ReportStatus,
    message_deleted: bool,
    user_warned: bool,
    user_timed_out: bool,
    user_banned: bool,
}

impl From<RawReportedMessage> for ReportedMessagePayload {
    fn from(r: RawReportedMessage) -> Self {
        Self {
            id: r.id,
            guild_id: GuildId::new(r.guild_id.cast_unsigned()),
            channel_id: ChannelId::new(r.channel_id.cast_unsigned()),
            message_id: MessageId::new(r.message_id.cast_unsigned()),
            author_id: UserId::new(r.author_id.cast_unsigned()),
            author_name: r.author_name.unwrap_or_default(),
            reporter_id: UserId::new(r.reporter_id.cast_unsigned()),
            reporter_name: r.reporter_name.unwrap_or_default(),
            content: r.content,
            attachment_url: r.attachment_url,
            reason: r.reason,
            status: r.status,
            message_deleted: r.message_deleted.into(),
            user_warned: r.user_warned.into(),
            user_timed_out: r.user_timed_out.into(),
            user_banned: r.user_banned.into(),
        }
    }
}

#[derive(sqlx::FromRow)]
struct RawTargetReport {
    guild_id: i64,
    author_id: i64,
    author_name: Option<String>,
}

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
    let row = sqlx::query_as!(
        RawReportedMessage,
        r#"
        SELECT
            r.id, r.guild_id, r.channel_id, r.message_id, r.author_id, r.reporter_id,
            a.username AS author_name, p.username AS reporter_name,
            r.content, r.attachment_url, r.reason,
            r.status as "status: ReportStatus", r.message_deleted,
            r.user_warned, r.user_timed_out, r.user_banned
        FROM reported_messages r
        LEFT JOIN discord_users a ON a.user_id = r.author_id
        LEFT JOIN discord_users p ON p.user_id = r.reporter_id
        WHERE r.id = $1
        "#,
        id
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(Into::into))
}

pub async fn fetch_target_report(
    pool: &PgPool,
    report_id: i64,
) -> Result<(GuildId, UserId, String), ActionError> {
    let report = sqlx::query_as!(
        RawTargetReport,
        r#"
        SELECT r.guild_id, r.author_id, u.username AS author_name
        FROM reported_messages r
        LEFT JOIN discord_users u ON u.user_id = r.author_id
        WHERE r.id = $1
        "#,
        report_id
    )
    .fetch_optional(pool)
    .await
    .inspect_err(|e| warn!(error = ?e, report_id, "reported message lookup failed"))
    .map_err(|_| ActionError::Internal)?
    .ok_or(ActionError::NotFound)?;

    let guild_id = GuildId::new(report.guild_id.cast_unsigned());
    let user_id = UserId::new(report.author_id.cast_unsigned());

    Ok((guild_id, user_id, report.author_name.unwrap_or_default()))
}

pub async fn fetch_reporter_id(pool: &PgPool, report_id: i64) -> Result<UserId, ActionError> {
    let reporter_id = sqlx::query_scalar!(
        "SELECT reporter_id FROM reported_messages WHERE id = $1",
        report_id
    )
    .fetch_optional(pool)
    .await
    .inspect_err(|e| warn!(error = ?e, report_id, "reporter id lookup failed"))
    .map_err(|_| ActionError::Internal)?
    .ok_or(ActionError::NotFound)?;

    Ok(UserId::new(reporter_id.cast_unsigned()))
}

pub async fn update_reported_message(
    pool: &PgPool,
    report_id: i64,
    update: ReportUpdate,
) -> Result<(), ActionError> {
    let column = match update {
        ReportUpdate::MessageDeleted => "message_deleted",
        ReportUpdate::UserWarned => "user_warned",
        ReportUpdate::UserTimedOut => "user_timed_out",
        ReportUpdate::UserBanned => "user_banned",
    };

    flag(pool, report_id, column).await
}

/// Sets one of the `message_deleted`, `user_warned`, `user_timed_out` and `user_banned`
/// markers.
///
/// The statement is picked from a fixed set rather than built from the column name, so the
/// `sqlx` macros can check it against the schema.
///
/// # Errors
/// Returns [`ActionError::Internal`] if the update does not land.
async fn flag(pool: &PgPool, report_id: i64, column: &'static str) -> Result<(), ActionError> {
    let query: sqlx::query::Query<'_, sqlx::Postgres, sqlx::postgres::PgArguments> = match column {
        "message_deleted" => {
            sqlx::query!(
                "UPDATE reported_messages SET message_deleted = TRUE WHERE id = $1",
                report_id
            )
        }
        "user_warned" => {
            sqlx::query!(
                "UPDATE reported_messages SET user_warned = TRUE WHERE id = $1",
                report_id
            )
        }
        "user_timed_out" => {
            sqlx::query!(
                "UPDATE reported_messages SET user_timed_out = TRUE WHERE id = $1",
                report_id
            )
        }
        _ => {
            sqlx::query!(
                "UPDATE reported_messages SET user_banned = TRUE WHERE id = $1",
                report_id
            )
        }
    };

    query
        .execute(pool)
        .await
        .inspect_err(|e| warn!(error = ?e, report_id, "reported message update failed"))
        .map_err(|_| ActionError::Internal)?;

    Ok(())
}

/// Settles a report's status only while it is still under review, and reports whether the row
/// was claimed. This is the guard against two moderators settling one report concurrently.
///
/// # Errors
/// Returns [`ActionError::Internal`] if the update does not land. A report that is already
/// settled is `Ok(false)`, not an error.
pub async fn update_reported_message_status_guarded(
    pool: &PgPool,
    report_id: i64,
    status: ReportStatus,
) -> Result<bool, ActionError> {
    let result = sqlx::query!(
        r#"
        UPDATE reported_messages
        SET status = $1::text::report_status
        WHERE id = $2 AND status = 'UNDER_REVIEW'::report_status
        "#,
        status_str(status),
        report_id
    )
    .execute(pool)
    .await
    .inspect_err(|e| warn!(error = ?e, report_id, "guarded report status update failed"))
    .map_err(|_| ActionError::Internal)?;

    Ok(result.rows_affected() > 0)
}

const fn status_str(status: ReportStatus) -> &'static str {
    match status {
        ReportStatus::UnderReview => "UNDER_REVIEW",
        ReportStatus::Actioned => "ACTIONED",
        ReportStatus::Dismissed => "DISMISSED",
    }
}
