use crate::core::config::settings::get_settings;
use crate::features::reporting::database::insert_reported_message;
use crate::features::reporting::types::{ReportStatus, ReportedMessagePayload};
use crate::features::reporting::{actions, cache};
use crate::shared::store_username_relation;
use crate::{Context, Error};
use fred::clients::Client;
use futures_util::TryFutureExt;
use poise::Modal;
use tracing::{debug, info, trace, warn};

#[derive(poise::Modal)]
#[name = "Report This Message"]
pub(crate) struct ReportModal {
    #[placeholder = "Please explain why you are reporting this message..."]
    #[paragraph]
    pub(crate) reason: String,
}

#[poise::command(context_menu_command = "Report This Message", guild_only)]
pub async fn report_message(
    ctx: Context<'_>,
    message: serenity::all::Message,
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
    let guild_id = ctx.guild_id().unwrap().get() as i64;

    info!(
        caller_id,
        message_id,
        guild_id,
        "Invoked report_message context menu command"
    );

    let db = &ctx.data().db;
    let redis = ctx.data().redis.clone();
    let guild_configs = &ctx.data().guild_configs;

    trace!(guild_id, "Fetching server settings for report configuration check");
    let config = get_settings(db, &redis, guild_configs, guild_id as i64).await?;
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
        let result = actions::issue_report(
            db, &ctx.data().redis,
            guild_id, message.channel_id.get() as i64,
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


