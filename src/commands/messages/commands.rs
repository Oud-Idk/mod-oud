use crate::commands::messages::action::issue_report;
use crate::commands::messages::database::{fetch_deleted_messages, fetch_modified_messages};
use crate::commands::messages::formatting;
use crate::core::config::get_settings;
use crate::types::{Context, Error};
use poise::{serenity_prelude as serenity, Modal};
use serenity::model::user::User;
use tracing::{debug, info, trace, warn};

#[derive(poise::Modal)]
#[name = "Report This Message"]
struct ReportModal {
    #[placeholder = "Please explain why you are reporting this message..."]
    #[paragraph]
    reason: String,
}

/// Get the history of deleted messages by a user
#[poise::command(slash_command, default_member_permissions = "BAN_MEMBERS", guild_only)]
pub async fn deleted_history(
    ctx: Context<'_>,
    #[description = "The user to fetch deleted messages of"] user: User,
    #[description = "The number of messages (default 10)"] messages: Option<i64>,
    #[description = "Show attachment URLs"] show_attachment_urls: Option<bool>,
    #[description = "Whether to show this as ephemeral. Normally true."] ephemeral: Option<bool>,
) -> Result<(), Error> {
    let target_uid = user.id.get() as i64;
    let limit = messages.unwrap_or(10);
    let show_attachments = show_attachment_urls.unwrap_or(false);
    let is_ephemeral = ephemeral.unwrap_or(true);

    info!(
        caller_id = ctx.author().id.get(),
        target_uid,
        limit,
        show_attachments,
        is_ephemeral,
        "Invoked deleted_history command"
    );

    let db_pool = &ctx.data().db;
    let records = fetch_deleted_messages(db_pool, &target_uid, limit).await?;

    if records.is_empty() {
        debug!(target_uid, "No deleted messages found in history");
        ctx.send(poise::CreateReply::default()
            .content(format!("No deleted messages found for {}.", user.name))
            .ephemeral(is_ephemeral)
        ).await?;
        return Ok(());
    }

    debug!(target_uid, count = records.len(), "Retrieved deleted history records, rendering response");
    let response = formatting::build_deleted_history_response(&records, user, show_attachments);

    ctx.send(poise::CreateReply::default().content(response).ephemeral(is_ephemeral)).await?;
    Ok(())
}

/// Get the history of edited messages by a user
#[poise::command(slash_command, default_member_permissions = "BAN_MEMBERS", guild_only)]
pub async fn edit_history(
    ctx: Context<'_>,
    #[description = "The user to fetch edited messages of"] user: User,
    #[description = "The number of messages (default 10)"] messages: Option<i64>,
    #[description = "Whether to show this as ephemeral. Normally true."] ephemeral: Option<bool>,
) -> Result<(), Error> {
    let target_uid = user.id.get() as i64;
    let limit = messages.unwrap_or(10);
    let is_ephemeral = ephemeral.unwrap_or(true);

    info!(
        caller_id = ctx.author().id.get(),
        target_uid,
        limit,
        is_ephemeral,
        "Invoked edit_history command"
    );

    let db_pool = &ctx.data().db;
    let records = fetch_modified_messages(db_pool, &target_uid, limit).await?;

    if records.is_empty() {
        debug!(target_uid, "No edited messages found in history");
        ctx.send(poise::CreateReply::default()
            .content(format!("No edited messages found for {}.", user.name))
            .ephemeral(is_ephemeral)
        ).await?;
        return Ok(());
    }

    debug!(target_uid, count = records.len(), "Retrieved edited history records, rendering response");
    let response = formatting::build_edited_history_response(&records, user);

    ctx.send(poise::CreateReply::default().content(response).ephemeral(is_ephemeral)).await?;
    Ok(())
}

#[poise::command(context_menu_command = "Report This Message", guild_only)]
pub async fn report_message(
    ctx: Context<'_>,
    message: serenity::Message,
) -> Result<(), Error> {
    let app_ctx = match ctx {
        Context::Application(x) => x,
        _ => {
            warn!(
                caller_id = ctx.author().id.get(),
                "report_message command triggered with a non-application context"
            );
            return Ok(());
        }
    };

    let caller_id = ctx.author().id.get();
    let message_id = message.id.get();
    let guild_id = ctx.guild_id().unwrap().get();

    info!(
        caller_id,
        message_id,
        guild_id,
        "Invoked report_message context menu command"
    );

    let db = &ctx.data().db;
    let redis = ctx.data().redis.clone();

    trace!(guild_id, "Fetching server settings for report configuration check");
    let config = get_settings(db, &redis, guild_id as i64).await?;
    let report_enabled = config.report.map_or(false, |r| r.enabled);

    if !report_enabled {
        debug!(guild_id, "Report command execution cancelled: report feature is disabled in this guild");
        ctx.send(poise::CreateReply::default()
            .content("Reporting isn't enabled in this guild.")
            .ephemeral(true)
        ).await?;
        return Ok(());
    }

    trace!(caller_id, "Executing report modal prompt");
    let modal_data = ReportModal::execute(app_ctx).await?;

    if let Some(modal) = modal_data {
        debug!(caller_id, message_id, "Report modal submitted; issuing report");
        let result = issue_report(
            db, &ctx.data().redis,
            guild_id, message.channel_id.get(),
            &message, ctx.author(), modal.reason,
        ).await?;

        let reply_content = match result {
            Some(report_id) => {
                info!(
                    caller_id,
                    message_id,
                    report_id,
                    "Message report successfully created and recorded"
                );
                "Your report has been submitted to the moderation team."
            }
            None => {
                debug!(
                    caller_id,
                    message_id,
                    "Duplicate report rejected: this message was already reported by this user"
                );
                "Someone has already reported this message."
            }
        };

        ctx.send(poise::CreateReply::default().content(reply_content).ephemeral(true)).await?;
    } else {
        trace!(caller_id, "Report modal was cancelled or timed out");
    }

    Ok(())
}