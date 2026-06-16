use crate::types::payloads::{ReportStatus, ReportedMessagePayload};
use crate::WebState;
use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

async fn broadcast_report_update(
    pool: &sqlx::PgPool,
    redis: &redis::Client,
    report_id: i32,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let row = sqlx::query!(
        r#"
        SELECT
            id, guild_id, channel_id, message_id, author_id, reporter_id,
            message_content, attachment_url, reason, author_name, reporter_name,
            status as "status!: ReportStatus", message_deleted,
            user_warned, user_timed_out, user_banned
        FROM reported_messages
        WHERE id = $1
        "#,
        report_id
    )
        .fetch_optional(pool)
        .await?
        .ok_or("Report ID not found in database")?;

    let sse_update = ReportedMessagePayload {
        id: row.id,
        guild_id: row.guild_id,
        channel_id: row.channel_id,
        message_id: row.message_id,
        reporter_name: row.reporter_name,
        author_name: row.author_name,
        reason: row.reason,
        content: row.message_content,
        attachment_url: row.attachment_url.unwrap_or_default(),
        status: row.status,
        message_deleted: row.message_deleted,
        user_warned: row.user_warned,
        user_timed_out: row.user_timed_out,
        user_banned: row.user_banned,
    };

    let sse_payload = serde_json::to_string(&sse_update)?;
    let mut conn = redis.get_multiplexed_async_connection().await?;

    let _: () = redis::cmd("PUBLISH")
        .arg("discord:reports")
        .arg(&sse_payload)
        .query_async(&mut conn)
        .await?;

    Ok(())
}

// src/routes/commands.rs

pub async fn handle_dashboard_command(
    State(state): State<Arc<WebState>>,
    Json(cmd): Json<DashboardCommand>,
) -> Result<StatusCode, (StatusCode, String)> {

    // Fetch target data from Postgres
    let report = sqlx::query!(
        "SELECT guild_id, author_id FROM reported_messages WHERE id = $1",
        cmd.report_id
    )
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Report ID not found".to_string()))?;

    let guild_id = poise::serenity_prelude::GuildId::new(
        report.guild_id.parse().map_err(|_| (StatusCode::BAD_REQUEST, "Invalid guild ID in DB".to_string()))?
    );
    let user_id = poise::serenity_prelude::UserId::new(
        report.author_id.parse().map_err(|_| (StatusCode::BAD_REQUEST, "Invalid user ID in DB".to_string()))?
    );

    // Execute the action directly
    match cmd.action {
        DashboardAction::ResolveReport { status } => {
            let status_str = match status {
                ReportStatus::UnderReview => "under_review",
                ReportStatus::Actioned => "actioned",
                ReportStatus::Dismissed => "dismissed",
            };

            sqlx::query!(
                "UPDATE reported_messages SET status = $1::text::report_status WHERE id = $2",
                status_str,
                cmd.report_id
            )
                .execute(&state.pool)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            broadcast_report_update(&state.pool, &state.redis_client, cmd.report_id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        }
        DashboardAction::DeleteMessage { channel_id, message_id } => {
            let ch_id = poise::serenity_prelude::ChannelId::new(
                channel_id.parse().map_err(|_| (StatusCode::BAD_REQUEST, "Invalid channel ID".to_string()))?
            );
            let msg_id = poise::serenity_prelude::MessageId::new(
                message_id.parse().map_err(|_| (StatusCode::BAD_REQUEST, "Invalid message ID".to_string()))?
            );

            match state.http.delete_message(ch_id, msg_id, Some("Deleted via Moderation Dashboard")).await {
                Ok(_) => {}
                Err(poise::serenity_prelude::Error::Http(http_err)) => {
                    if http_err.status_code() != Some(poise::serenity_prelude::http::StatusCode::NOT_FOUND) {
                        return Err((StatusCode::BAD_GATEWAY, format!("Discord API Error: {}", http_err)));
                    }
                }
                Err(e) => return Err((StatusCode::BAD_GATEWAY, format!("Discord API Error: {}", e))),
            }

            sqlx::query!(
                "UPDATE reported_messages SET message_deleted = TRUE WHERE id = $1",
                cmd.report_id
            )
                .execute(&state.pool)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            broadcast_report_update(&state.pool, &state.redis_client, cmd.report_id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        }
        DashboardAction::WarnUser => {
            let redis_conn = state.redis_client.get_multiplexed_async_connection().await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            // Resolve moderator ID safely (fall back to bot's own ID if missing/invalid)
            let mod_id_val = match cmd.moderator_id.as_ref().and_then(|id| id.parse::<u64>().ok()) {
                Some(id) if id != 0 => id,
                _ => {
                    state.http.get_current_user().await
                        .map(|u| u.id.get()) // Convert to raw u64
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to fetch fallback bot details: {}", e)))?
                }
            };
            let moderator_id = poise::serenity_prelude::UserId::new(mod_id_val);
            let reason_str = cmd.reason.as_deref().unwrap_or("No reason specified");

            crate::utils::moderating::issue_warning(
                &state.pool,
                &redis_conn,
                &state.http,
                guild_id,
                user_id,
                moderator_id,
                reason_str,
            )
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            sqlx::query!(
                "UPDATE reported_messages SET user_warned = TRUE WHERE id = $1",
                cmd.report_id
            )
                .execute(&state.pool)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            broadcast_report_update(&state.pool, &state.redis_client, cmd.report_id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        }
        DashboardAction::TimeoutUser => {
            let duration_mins = cmd.duration_mins.ok_or_else(|| {
                (StatusCode::BAD_REQUEST, "Missing duration_mins parameter".to_string())
            })?;

            let mut redis_conn = state.redis_client.get_multiplexed_async_connection().await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let user = user_id.to_user(&state.http).await
                .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Failed to retrieve target user: {}", e)))?;

            // Resolve moderator ID safely (fall back to bot's own ID if missing/invalid)
            let mod_id_val = match cmd.moderator_id.as_ref().and_then(|id| id.parse::<u64>().ok()) {
                Some(id) if id != 0 => id,
                _ => {
                    state.http.get_current_user().await
                        .map(|u| u.id.get()) // Convert to raw u64
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to fetch fallback bot details: {}", e)))?
                }
            };
            let moderator = poise::serenity_prelude::UserId::new(mod_id_val).to_user(&state.http).await
                .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Failed to retrieve moderator details: {}", e)))?;

            let reason_str = cmd.reason.as_deref().unwrap_or("Timeout applied via Moderation Dashboard");

            let future_secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
                .as_secs() + (duration_mins * 60);

            let timestamp = poise::serenity_prelude::Timestamp::from_unix_timestamp(future_secs as i64)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let duration = std::time::Duration::from_secs(duration_mins * 60);

            crate::utils::moderating::issue_mute(
                &state.pool,
                &redis_conn,
                &state.http,
                guild_id,
                user,
                moderator,
                reason_str,
                &duration,
                timestamp,
            )
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to issue mute: {}", e)))?;

            sqlx::query!(
                "UPDATE reported_messages SET user_timed_out = TRUE WHERE id = $1",
                cmd.report_id
            )
                .execute(&state.pool)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            broadcast_report_update(&state.pool, &state.redis_client, cmd.report_id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        }
        DashboardAction::BanUser => {
            let redis_conn = state.redis_client.get_multiplexed_async_connection().await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let user = user_id.to_user(&state.http).await
                .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Failed to retrieve target user: {}", e)))?;

            let mod_id_val = match cmd.moderator_id.as_ref().and_then(|id| id.parse::<u64>().ok()) {
                Some(id) if id != 0 => id,
                _ => {
                    state.http.get_current_user().await
                        .map(|u| u.id.get())
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to fetch fallback bot details: {}", e)))?
                }
            };
            let moderator = poise::serenity_prelude::UserId::new(mod_id_val).to_user(&state.http).await
                .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Failed to retrieve moderator details: {}", e)))?;

            let reason_str = cmd.reason.as_deref().unwrap_or("No reason specified");

            let duration = cmd.duration_mins.map(|mins| std::time::Duration::from_secs(mins * 60));

            // Format duration label for the moderator DM embed
            let duration_label = match cmd.duration_mins {
                Some(mins) => {
                    if mins >= 1440 {
                        format!("Temporary ({} days)", mins / 1440)
                    } else if mins >= 60 {
                        format!("Temporary ({} hours)", mins / 60)
                    } else {
                        format!("Temporary ({} minutes)", mins)
                    }
                }
                None => "Permanent".to_string(),
            };

            // Execute using your custom ban helper
            crate::utils::moderating::issue_ban(
                &state.pool,
                &redis_conn,
                &state.http,
                guild_id,
                user,
                moderator,
                reason_str,
                7,
                duration,
                &duration_label,
            )
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to issue ban: {}", e)))?;

            // Update database to mark as permanently banned
            sqlx::query!(
                "UPDATE reported_messages SET user_banned = TRUE WHERE id = $1",
                cmd.report_id
            )
                .execute(&state.pool)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            broadcast_report_update(&state.pool, &state.redis_client, cmd.report_id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        }
    }

    Ok(StatusCode::OK)
}

#[derive(Deserialize, Debug)]
pub(crate) struct DashboardCommand {
    #[serde(flatten)]
    pub(crate) action: DashboardAction,
    pub(crate) report_id: i32,
    pub(crate) moderator_id: Option<String>,
    pub(crate) reason: Option<String>,
    pub(crate) duration_mins: Option<u64>,
    pub(crate) status: Option<ReportStatus>,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum DashboardAction {
    ResolveReport { status: ReportStatus },
    DeleteMessage { channel_id: String, message_id: String },
    WarnUser,
    TimeoutUser,
    BanUser,
}